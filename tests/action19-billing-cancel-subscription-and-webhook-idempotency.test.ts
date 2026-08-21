import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';
import { processWebhookEvent } from '../src/modules/webhooks/webhooks.service.js';
import { cancelSubscription } from '../src/modules/billing/billing.service.js';
import * as jwtService from '../src/modules/auth/jwt.service.js';

// All test-created baker/event ids are prefixed so cleanup can find them
// reliably and so they never collide with 'test-baker-id' (owned by
// action17/action18) or real production data.
const TEST_PREFIX = 'test-billing19-';

async function deleteTestBakers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.billingHistory.deleteMany({ where: { bakerId: { in: ids } } });
  await prisma.baker.deleteMany({ where: { id: { in: ids } } });
}

describe('Webhook idempotency dedup + cancel-subscription endpoint', () => {
  describe('webhook idempotency: BillingHistory dedup on subscriptionId + paymentId + eventType', () => {
    const bakerId = `${TEST_PREFIX}webhook-dedupe`;
    const subscriptionId = 'sub_test19_dedupe';
    const eventIds = ['evt19-dup-a', 'evt19-dup-b', 'evt19-cycle-1', 'evt19-cycle-2'];

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.webhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'PENDING',
          razorpaySubscriptionId: subscriptionId,
        },
      });
    });

    afterAll(async () => {
      await prisma.webhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
      await deleteTestBakers([bakerId]);
    });

    it('two different Razorpay eventIds for the same subscriptionId + paymentId + eventType write only one BillingHistory row', async () => {
      const paymentId = 'pay_test19_dedupe';

      // Same underlying charge, delivered twice under two different
      // Razorpay event IDs - mirrors the real duplicate confirmed in
      // production on 2026-08-08 (two subscription.activated deliveries,
      // same subscriptionId + paymentId, ~4s apart).
      await processWebhookEvent({
        eventId: 'evt19-dup-a',
        eventType: 'subscription.activated',
        subscriptionId,
        paymentId,
        amount: 14900,
        currency: 'INR',
      });
      await processWebhookEvent({
        eventId: 'evt19-dup-b',
        eventType: 'subscription.activated',
        subscriptionId,
        paymentId,
        amount: 14900,
        currency: 'INR',
      });

      const rows = await prisma.billingHistory.findMany({ where: { subscriptionId, paymentId } });
      expect(rows).toHaveLength(1);

      // Both deliveries were still individually acknowledged (each has its
      // own WebhookEvent row) - only the redundant BillingHistory insert
      // was suppressed, not the webhook processing itself.
      const events = await prisma.webhookEvent.findMany({
        where: { eventId: { in: ['evt19-dup-a', 'evt19-dup-b'] } },
      });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.status === 'SUCCESS')).toBe(true);
    });

    it('two genuinely different paymentIds under the same subscriptionId (separate monthly charges) each write their own row', async () => {
      await processWebhookEvent({
        eventId: 'evt19-cycle-1',
        eventType: 'subscription.charged',
        subscriptionId,
        paymentId: 'pay_test19_cycle_1',
        amount: 14900,
        currency: 'INR',
      });
      await processWebhookEvent({
        eventId: 'evt19-cycle-2',
        eventType: 'subscription.charged',
        subscriptionId,
        paymentId: 'pay_test19_cycle_2',
        amount: 14900,
        currency: 'INR',
      });

      const rows = await prisma.billingHistory.findMany({
        where: { subscriptionId, paymentId: { in: ['pay_test19_cycle_1', 'pay_test19_cycle_2'] } },
      });
      expect(rows).toHaveLength(2);
    });
  });

  describe('cancelSubscription service function', () => {
    const bakerId = `${TEST_PREFIX}cancel-service`;

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
      vi.restoreAllMocks();
    });

    it('rejects cleanly when razorpaySubscriptionId is null', async () => {
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: { id: bakerId, status: 'ACTIVE', subscriptionStatus: 'TRIAL' },
      });

      const cancelSpy = vi.spyOn(razorpayGateway, 'cancelSubscription');
      await expect(cancelSubscription(bakerId)).rejects.toThrow('No active subscription to cancel');
      expect(cancelSpy).not.toHaveBeenCalled();
      cancelSpy.mockRestore();
    });

    it('rejects when subscriptionStatus is already CANCELLED', async () => {
      await prisma.baker.update({
        where: { id: bakerId },
        data: { subscriptionStatus: 'CANCELLED', razorpaySubscriptionId: 'sub_test19_already_cancelled' },
      });

      const cancelSpy = vi.spyOn(razorpayGateway, 'cancelSubscription');
      await expect(cancelSubscription(bakerId)).rejects.toThrow('No active subscription to cancel');
      expect(cancelSpy).not.toHaveBeenCalled();
      cancelSpy.mockRestore();
    });

    it('rejects when subscriptionStatus is already EXPIRED', async () => {
      await prisma.baker.update({
        where: { id: bakerId },
        data: { subscriptionStatus: 'EXPIRED' },
      });

      const cancelSpy = vi.spyOn(razorpayGateway, 'cancelSubscription');
      await expect(cancelSubscription(bakerId)).rejects.toThrow('No active subscription to cancel');
      expect(cancelSpy).not.toHaveBeenCalled();
      cancelSpy.mockRestore();
    });

    it('on a valid case, calls the gateway with cancelAtCycleEnd: true and does not itself write subscriptionStatus or null any razorpay* field', async () => {
      await prisma.baker.update({
        where: { id: bakerId },
        data: {
          subscriptionStatus: 'ACTIVE',
          razorpaySubscriptionId: 'sub_test19_valid_cancel',
          razorpayCustomerId: 'cust_test19_valid_cancel',
          razorpayPlanId: 'plan_test19_valid_cancel',
        },
      });

      const before = await prisma.baker.findUniqueOrThrow({ where: { id: bakerId } });

      const cancelSpy = vi
        .spyOn(razorpayGateway, 'cancelSubscription')
        .mockImplementation(async (subscriptionId) => ({
          subscriptionId,
          status: 'active',
        }));

      const result = await cancelSubscription(bakerId);

      expect(cancelSpy).toHaveBeenCalledWith('sub_test19_valid_cancel', true);
      expect(result.subscriptionId).toBe('sub_test19_valid_cancel');
      expect(result.cancelAtCycleEnd).toBe(true);

      // The webhook, not this call, is the only thing allowed to write
      // these fields - confirm nothing here mutated the baker row at all.
      const after = await prisma.baker.findUniqueOrThrow({ where: { id: bakerId } });
      expect(after.subscriptionStatus).toBe(before.subscriptionStatus);
      expect(after.razorpaySubscriptionId).toBe(before.razorpaySubscriptionId);
      expect(after.razorpayCustomerId).toBe(before.razorpayCustomerId);
      expect(after.razorpayPlanId).toBe(before.razorpayPlanId);

      cancelSpy.mockRestore();
    });
  });

  describe('route-level: POST /api/billing/cancel-subscription gating', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    const bakerId = `${TEST_PREFIX}route-gate`;
    let accessToken: string;

    beforeAll(async () => {
      app = await buildApp();
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          // Deliberately read-only per write-access.ts's own condition:
          // status !== ACTIVE AND trialEndsAt has already passed. A route
          // gated with requireWriteAccess would return 402 for exactly
          // this baker state.
          subscriptionStatus: 'PAUSED',
          trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          razorpaySubscriptionId: 'sub_test19_route_gate',
        },
      });

      // Real signed access token for this specific isolated test baker,
      // independent of the shared DEV_BYPASS_AUTH 'test-baker-id' identity
      // that action17/action18 rely on - avoids mutating shared fixture
      // state or racing with those files' own use of it.
      accessToken = await jwtService.generateAccessToken({
        sub: bakerId,
        sessionId: 'test19-route-gate-session',
      });

      vi.spyOn(razorpayGateway, 'cancelSubscription').mockResolvedValue({
        subscriptionId: 'sub_test19_route_gate',
        status: 'active',
      });
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
      vi.restoreAllMocks();
    });

    it('a trial-expired, non-ACTIVE baker is NOT blocked by requireWriteAccess on this route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/cancel-subscription',
        headers: {
          cookie: `kamai_access_token=${accessToken}`,
        },
      });

      // A write-access-gated route returns 402 SUBSCRIPTION_REQUIRED for
      // exactly this baker state (see write-access.ts). Anything else here
      // proves requireWriteAccess is not attached to this route.
      expect(response.statusCode).not.toBe(402);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.cancelAtCycleEnd).toBe(true);
    });
  });
});
