import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';
import { createSubscription } from '../src/modules/billing/billing.service.js';

// paid_subscription_counter is a single global Postgres SEQUENCE shared
// with real production pricing decisions (see migration
// 20260807000000_update_trial_length_and_pricing and billing.service.ts).
// Every nextval() call here - direct or via the HTTP endpoints below -
// permanently advances that same counter unless we restore it. We
// snapshot its state before this suite runs and force it back with
// setval() afterwards, so running/re-running this test file never
// consumes real early-adopter slots.
async function readSequenceState() {
  const rows = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`
    SELECT last_value, is_called FROM paid_subscription_counter
  `;
  return rows[0]!;
}

async function restoreSequenceState(state: { last_value: bigint; is_called: boolean }) {
  await prisma.$executeRaw`
    SELECT setval('paid_subscription_counter', ${state.last_value}, ${state.is_called})
  `;
}

describe('Action 17 E2E: Billing & Subscription', () => {
  let app: any;
  let sequenceSnapshot: { last_value: bigint; is_called: boolean };

  beforeAll(async () => {
    app = await buildApp();
    sequenceSnapshot = await readSequenceState();

    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'TRIAL',
      }
    });

    // Mock Razorpay SDK subscription creation. razorpaySubscriptionId is
    // unique per baker in the DB, so the mock must return a distinct ID
    // per call (tests below create subscriptions for several bakers).
    vi.spyOn(razorpayGateway, 'createSubscription').mockImplementation(async (_planId, bakerId) => ({
      subscriptionId: `sub_mock_${bakerId}`,
      checkoutUrl: 'https://checkout.razorpay.com/v1/checkout.html',
    }));
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
    await restoreSequenceState(sequenceSnapshot);
    vi.restoreAllMocks();
  });

  it('should get current billing status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/billing/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.subscriptionStatus).toBeDefined();
    expect(body.data.lockedMonthlyPrice).toBeNull();
    expect(typeof body.data.currentOfferPrice).toBe('number');
    expect(typeof body.data.spotsRemaining).toBe('number');
  });

  it('should successfully initiate subscription creation via Razorpay mock, locked at the early-adopter price', async () => {
    // Sequence is pristine (restored from snapshot at file scope, and
    // this is the first nextval() consumer in this suite), so this lands
    // well under the 149 threshold.
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/create-subscription',
      payload: {
        plan: 'EARLY_ADOPTER',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.subscriptionId).toBe('sub_mock_test-baker-id');
    expect(body.data.checkoutUrl).toBeDefined();
    expect(body.data.plan).toBe('EARLY_ADOPTER');
    expect(body.data.monthlyPrice).toBe(149);

    const baker = await prisma.baker.findUnique({ where: { id: 'test-baker-id' } });
    expect(baker?.subscriptionPlan).toBe('EARLY_ADOPTER');
    expect(baker?.isEarlyAdopter).toBe(true);
    expect(Number(baker?.lockedMonthlyPrice)).toBe(149);
  });

  it('should reflect the stored locked price (not a hardcoded constant) via GET /status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/billing/status',
    });

    const body = JSON.parse(response.body);
    expect(body.data.lockedMonthlyPrice).toBe(149);
  });

  describe('threshold pricing boundary', () => {
    const bakerIds = ['test-baker-149th', 'test-baker-150th'];

    beforeAll(async () => {
      await prisma.baker.deleteMany({ where: { id: { in: bakerIds } } });
      await Promise.all(
        bakerIds.map((id) =>
          prisma.baker.create({ data: { id, status: 'ACTIVE', subscriptionStatus: 'TRIAL' } }),
        ),
      );
      // Position the sequence so the very next nextval() returns exactly
      // 149 (the last discounted slot), and the one after returns 150
      // (the first standard-price slot).
      await prisma.$executeRaw`SELECT setval('paid_subscription_counter', 148, true)`;
    });

    afterAll(async () => {
      await prisma.baker.deleteMany({ where: { id: { in: bakerIds } } });
    });

    it('prices the 149th paid subscription ever at the early-adopter rate', async () => {
      const result = await createSubscription(bakerIds[0]!, { plan: 'EARLY_ADOPTER' });
      expect(result.plan).toBe('EARLY_ADOPTER');
      expect(result.monthlyPrice).toBe(149);
    });

    it('prices the 150th paid subscription ever at the standard rate', async () => {
      const result = await createSubscription(bakerIds[1]!, { plan: 'EARLY_ADOPTER' });
      expect(result.plan).toBe('STANDARD');
      expect(result.monthlyPrice).toBe(199);
    });
  });

  describe('atomic counter under concurrency', () => {
    const bakerIds = Array.from({ length: 5 }, (_, i) => `test-baker-race-${i}`);

    beforeAll(async () => {
      await prisma.baker.deleteMany({ where: { id: { in: bakerIds } } });
      await Promise.all(
        bakerIds.map((id) =>
          prisma.baker.create({ data: { id, status: 'ACTIVE', subscriptionStatus: 'TRIAL' } }),
        ),
      );
      // 2 discounted slots remain (positions 148, 149); the other 3 of
      // these 5 concurrent creates must land at the standard price.
      await prisma.$executeRaw`SELECT setval('paid_subscription_counter', 147, true)`;
    });

    afterAll(async () => {
      await prisma.baker.deleteMany({ where: { id: { in: bakerIds } } });
    });

    it('never lets more than the remaining slot count land at the discounted price', async () => {
      const results = await Promise.all(
        bakerIds.map((id) => createSubscription(id, { plan: 'EARLY_ADOPTER' })),
      );

      const earlyAdopterCount = results.filter((r) => r.plan === 'EARLY_ADOPTER').length;
      const standardCount = results.filter((r) => r.plan === 'STANDARD').length;

      expect(earlyAdopterCount).toBe(2);
      expect(standardCount).toBe(3);

      // Persisted correctly on each baker, not just in the response.
      const bakers = await prisma.baker.findMany({ where: { id: { in: bakerIds } } });
      const persistedEarlyAdopter = bakers.filter((b) => Number(b.lockedMonthlyPrice) === 149).length;
      const persistedStandard = bakers.filter((b) => Number(b.lockedMonthlyPrice) === 199).length;
      expect(persistedEarlyAdopter).toBe(2);
      expect(persistedStandard).toBe(3);
    });
  });
});
