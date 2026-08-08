import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';
import { createSubscription, getBillingStatus } from '../src/modules/billing/billing.service.js';

// Threshold pricing now counts currently-ACTIVE Rs149 baker rows directly
// (no more sequence) - every fake baker this file creates to manipulate
// that count is real state in the same table real production traffic
// reads from. All test-created baker ids are prefixed 'test-billing-' so
// cleanup can find them reliably, and every describe block cleans up in
// both beforeAll (defensive, in case a previous run crashed mid-test)
// and afterAll.
//
// Tests that need to land at an exact threshold position (148 active,
// 149 active, etc.) measure the REAL current active count first and
// create exactly enough filler bakers to reach the target - never
// assuming production starts at zero, since this count is live,
// shared state, not something a test can independently reset.
const TEST_PREFIX = 'test-billing-';

async function deleteTestBakers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.baker.deleteMany({ where: { id: { in: ids } } });
}

async function realActiveEarlyAdopterCount(): Promise<number> {
  return prisma.baker.count({
    where: { subscriptionStatus: 'ACTIVE', lockedMonthlyPrice: 149, excludeFromSubscriberCount: false },
  });
}

function fillerData(ids: string[]) {
  // displayId supplied explicitly (not left to the DB trigger's default):
  // Prisma's createMany doesn't reliably re-invoke a dbgenerated() BEFORE
  // INSERT trigger per row within a single batched multi-row INSERT,
  // which caused real unique-constraint collisions on display_id here.
  return ids.map((id, i) => ({
    id,
    displayId: `TEST-${id}-${i}`,
    status: 'ACTIVE',
    subscriptionStatus: 'ACTIVE',
    lockedMonthlyPrice: 149,
  }));
}

describe('Action 17 E2E: Billing & Subscription', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
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
    // Still just PENDING here (mocked Razorpay call, no real webhook) -
    // must NOT count toward the active-subscriber threshold. Covered
    // explicitly below too, but worth asserting inline here.
    expect(baker?.subscriptionStatus).toBe('PENDING');
  });

  it('should reflect the stored locked price (not a hardcoded constant) via GET /status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/billing/status',
    });

    const body = JSON.parse(response.body);
    expect(body.data.lockedMonthlyPrice).toBe(149);
  });

  describe('abandoned/PENDING checkouts do not consume a slot', () => {
    const bakerId = `${TEST_PREFIX}abandoned`;

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
    });

    it('a PENDING (never-authorized) subscription does not change currentOfferPrice or spotsRemaining', async () => {
      const before = await getBillingStatus('test-baker-id');

      await prisma.baker.create({
        data: { id: bakerId, status: 'ACTIVE', subscriptionStatus: 'TRIAL' },
      });
      const result = await createSubscription(bakerId, { plan: 'EARLY_ADOPTER' });
      expect(result.plan).toBe('EARLY_ADOPTER');

      const baker = await prisma.baker.findUnique({ where: { id: bakerId } });
      expect(baker?.subscriptionStatus).toBe('PENDING');

      const after = await getBillingStatus('test-baker-id');
      expect(after.currentOfferPrice).toBe(before.currentOfferPrice);
      expect(after.spotsRemaining).toBe(before.spotsRemaining);
    });
  });

  describe('threshold pricing boundary (live ACTIVE count)', () => {
    const bakerIds = [`${TEST_PREFIX}149th`, `${TEST_PREFIX}150th`];
    let fillerIds: string[] = [];
    let allIds: string[] = [];

    beforeAll(async () => {
      const realCount = await realActiveEarlyAdopterCount();
      // Enough fillers to bring the active count to exactly 148,
      // regardless of whatever the real baseline is.
      const fillersNeeded = Math.max(0, 148 - realCount);
      fillerIds = Array.from({ length: fillersNeeded }, (_, i) => `${TEST_PREFIX}filler-${i}`);
      allIds = [...fillerIds, ...bakerIds];

      await deleteTestBakers(allIds);
      await prisma.baker.createMany({ data: fillerData(fillerIds) });
      await prisma.baker.createMany({
        data: bakerIds.map((id) => ({ id, status: 'ACTIVE', subscriptionStatus: 'TRIAL' })),
      });
    });

    afterAll(async () => {
      await deleteTestBakers(allIds);
    });

    it('prices the 149th concurrent active subscriber at the early-adopter rate', async () => {
      const result = await createSubscription(bakerIds[0]!, { plan: 'EARLY_ADOPTER' });
      expect(result.plan).toBe('EARLY_ADOPTER');
      expect(result.monthlyPrice).toBe(149);

      // Actually make it ACTIVE (simulating webhook confirmation) so the
      // next test in this block sees 149 real active subscribers.
      await prisma.baker.update({ where: { id: bakerIds[0]! }, data: { subscriptionStatus: 'ACTIVE' } });
    });

    it('prices the 150th concurrent active subscriber at the standard rate', async () => {
      const result = await createSubscription(bakerIds[1]!, { plan: 'EARLY_ADOPTER' });
      expect(result.plan).toBe('STANDARD');
      expect(result.monthlyPrice).toBe(199);
    });
  });

  describe('cancellation frees a slot back up', () => {
    const nextBakerId = `${TEST_PREFIX}after-cancel`;
    let fillerIds: string[] = [];
    let allIds: string[] = [];

    beforeAll(async () => {
      const realCount = await realActiveEarlyAdopterCount();
      // Enough fillers to sit exactly at the threshold (149 active).
      const fillersNeeded = Math.max(0, 149 - realCount);
      fillerIds = Array.from({ length: fillersNeeded }, (_, i) => `${TEST_PREFIX}cancel-filler-${i}`);
      allIds = [...fillerIds, nextBakerId];

      await deleteTestBakers(allIds);
      await prisma.baker.createMany({ data: fillerData(fillerIds) });
      await prisma.baker.create({
        data: { id: nextBakerId, status: 'ACTIVE', subscriptionStatus: 'TRIAL' },
      });
    });

    afterAll(async () => {
      await deleteTestBakers(allIds);
    });

    it('a cancellation drops the active count and reopens the discounted price', async () => {
      const atThreshold = await createSubscription(nextBakerId, { plan: 'EARLY_ADOPTER' });
      expect(atThreshold.plan).toBe('STANDARD');

      // Free one slot, as the subscription.cancelled webhook would.
      await prisma.baker.update({
        where: { id: fillerIds[0]! },
        data: { subscriptionStatus: 'CANCELLED' },
      });
      // Reset the STANDARD-priced attempt above back to TRIAL so it can
      // subscribe again.
      await prisma.baker.update({ where: { id: nextBakerId }, data: { subscriptionStatus: 'TRIAL' } });

      const afterCancellation = await createSubscription(nextBakerId, { plan: 'EARLY_ADOPTER' });
      expect(afterCancellation.plan).toBe('EARLY_ADOPTER');
      expect(afterCancellation.monthlyPrice).toBe(149);
    });
  });

  describe('excludeFromSubscriberCount accounts', () => {
    const excludedId = `${TEST_PREFIX}excluded-founder`;
    const nextBakerId = `${TEST_PREFIX}after-excluded`;

    beforeAll(async () => {
      await deleteTestBakers([excludedId, nextBakerId]);
    });

    afterAll(async () => {
      await deleteTestBakers([excludedId, nextBakerId]);
    });

    it('an excluded ACTIVE Rs149 account does not count toward the threshold, but keeps its own full access', async () => {
      const before = await getBillingStatus('test-baker-id');

      await prisma.baker.create({
        data: {
          id: excludedId,
          status: 'ACTIVE',
          subscriptionStatus: 'ACTIVE',
          lockedMonthlyPrice: 149,
          excludeFromSubscriberCount: true,
        },
      });

      const after = await getBillingStatus('test-baker-id');
      expect(after.spotsRemaining).toBe(before.spotsRemaining);
      expect(after.currentOfferPrice).toBe(before.currentOfferPrice);

      // The excluded account itself is unaffected - still reports ACTIVE
      // with its own locked price, exactly like any other subscriber.
      const excludedStatus = await getBillingStatus(excludedId);
      expect(excludedStatus.subscriptionStatus).toBe('ACTIVE');
      expect(excludedStatus.lockedMonthlyPrice).toBe(149);
    });
  });

  describe('concurrent createSubscription calls under the advisory lock', () => {
    // Unlike the old sequence-based design, a burst of concurrent
    // createSubscription calls does NOT split across the threshold: none
    // of them become ACTIVE synchronously (they land on PENDING, same as
    // any single call would), so none of them affect each other's
    // ACTIVE-count read. They correctly all see the same pre-burst count
    // and all get priced the same way - this is the accepted tradeoff of
    // only counting ACTIVE (not PENDING), not a race bug. What the
    // advisory lock actually guarantees, and what's worth testing, is
    // that this is *consistent* (never flips per-call) and that it's
    // impossible for anyone to slip under the threshold via a stale read
    // once the count has genuinely reached it.
    const belowThresholdIds = Array.from({ length: 5 }, (_, i) => `${TEST_PREFIX}race-below-${i}`);
    const atThresholdIds = Array.from({ length: 5 }, (_, i) => `${TEST_PREFIX}race-at-${i}`);
    let fillerIds: string[] = [];
    let allIds: string[] = [];

    beforeAll(async () => {
      const realCount = await realActiveEarlyAdopterCount();
      // 149 active total: exactly at the threshold, so every subsequent
      // create - concurrent or not - must land at the standard price.
      const fillersNeeded = Math.max(0, 149 - realCount);
      fillerIds = Array.from({ length: fillersNeeded }, (_, i) => `${TEST_PREFIX}race-filler-${i}`);
      allIds = [...fillerIds, ...belowThresholdIds, ...atThresholdIds];

      await deleteTestBakers(allIds);
      await prisma.baker.createMany({ data: fillerData(fillerIds) });
      await prisma.baker.createMany({
        data: [...belowThresholdIds, ...atThresholdIds].map((id) => ({
          id,
          status: 'ACTIVE',
          subscriptionStatus: 'TRIAL',
        })),
      });
    });

    afterAll(async () => {
      await deleteTestBakers(allIds);
    });

    it('a concurrent burst starting below the threshold consistently gets the discounted price', async () => {
      // Drop 2 fillers to CANCELLED first, so the active count sits at
      // 147 (2 slots below threshold) for this specific burst.
      const [f0, f1] = fillerIds;
      await prisma.baker.updateMany({
        where: { id: { in: [f0!, f1!] } },
        data: { subscriptionStatus: 'CANCELLED' },
      });

      const results = await Promise.all(
        belowThresholdIds.map((id) => createSubscription(id, { plan: 'EARLY_ADOPTER' })),
      );
      expect(results.every((r) => r.plan === 'EARLY_ADOPTER')).toBe(true);
      expect(results.every((r) => r.monthlyPrice === 149)).toBe(true);

      // Restore for the next test in this block.
      await prisma.baker.updateMany({
        where: { id: { in: [f0!, f1!] } },
        data: { subscriptionStatus: 'ACTIVE' },
      });
    });

    it('a concurrent burst starting at the threshold never lets anyone through at the discounted price', async () => {
      const results = await Promise.all(
        atThresholdIds.map((id) => createSubscription(id, { plan: 'EARLY_ADOPTER' })),
      );
      expect(results.every((r) => r.plan === 'STANDARD')).toBe(true);
      expect(results.every((r) => r.monthlyPrice === 199)).toBe(true);

      const bakers = await prisma.baker.findMany({ where: { id: { in: atThresholdIds } } });
      expect(bakers.every((b) => Number(b.lockedMonthlyPrice) === 199)).toBe(true);
    });
  });
});
