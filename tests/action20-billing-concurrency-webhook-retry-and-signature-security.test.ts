import crypto from 'crypto';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';
import { razorpayWebhookProcessor } from '../src/modules/webhooks/razorpay-webhook.processor.js';
import { processWebhookEvent } from '../src/modules/webhooks/webhooks.service.js';
import { createSubscription, getBillingStatus } from '../src/modules/billing/billing.service.js';
import { getBakerProfile } from '../src/modules/baker/baker-profile.service.js';
import { getTrialDaysRemaining } from '../src/shared/utils/trial.util.js';
import { env } from '../src/config/env.js';

// All test-created baker/event ids are prefixed so cleanup can find them
// reliably and never collide with other test files' fixtures or real data.
const TEST_PREFIX = 'test-billing20-';

async function deleteTestBakers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.billingHistory.deleteMany({ where: { bakerId: { in: ids } } });
  await prisma.baker.deleteMany({ where: { id: { in: ids } } });
}

describe('Billing concurrency, webhook retry integrity, signature timing-safety', () => {
  describe('Task 1: per-baker advisory lock prevents concurrent duplicate Razorpay subscriptions', () => {
    const bakerId = `${TEST_PREFIX}concurrent-create`;

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: { id: bakerId, status: 'ACTIVE', subscriptionStatus: 'TRIAL' },
      });
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
      vi.restoreAllMocks();
    });

    it('only one of two concurrent createSubscription calls for the same baker succeeds; only one Razorpay subscription is created', async () => {
      let callCount = 0;
      const createSpy = vi.spyOn(razorpayGateway, 'createSubscription').mockImplementation(async () => {
        callCount += 1;
        return {
          subscriptionId: `sub_mock_concurrent_${callCount}`,
          checkoutUrl: 'https://checkout.razorpay.com/v1/checkout.html',
        };
      });

      // Both calls start executing synchronously (up to their first
      // await, inside the transaction) before either resolves - a
      // genuine race at the DB level, not just event-loop ordering.
      const results = await Promise.allSettled([
        createSubscription(bakerId, { plan: 'EARLY_ADOPTER' }),
        createSubscription(bakerId, { plan: 'EARLY_ADOPTER' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
        'Subscription already active or pending',
      );

      // The per-baker lock didn't just make one DB write win - it kept
      // the second call from ever reaching Razorpay in the first place.
      expect(createSpy).toHaveBeenCalledTimes(1);

      const baker = await prisma.baker.findUniqueOrThrow({ where: { id: bakerId } });
      expect(baker.subscriptionStatus).toBe('PENDING');
      expect(baker.razorpaySubscriptionId).toBe('sub_mock_concurrent_1');
    });
  });

  describe('Task 2: FAILED webhook events are retried, not permanently swallowed', () => {
    const bakerId = `${TEST_PREFIX}webhook-retry`;
    const subscriptionId = 'sub_test20_retry_notfound';
    const eventId = 'evt20-retry-test';

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.webhookEvent.deleteMany({ where: { eventId } });
    });

    afterAll(async () => {
      await prisma.webhookEvent.deleteMany({ where: { eventId } });
      await deleteTestBakers([bakerId]);
    });

    it('first delivery fails (no matching baker) and is recorded FAILED; a retry with the same eventId, once the baker exists, actually re-processes to SUCCESS', async () => {
      // First delivery: no baker with this subscriptionId exists yet.
      await expect(
        processWebhookEvent({
          eventId,
          eventType: 'subscription.activated',
          subscriptionId,
          paymentId: 'pay_test20_retry',
          amount: 14900,
          currency: 'INR',
        }),
      ).rejects.toThrow('Baker not found');

      const afterFirstAttempt = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(afterFirstAttempt?.status).toBe('FAILED');

      // Underlying condition resolves - the baker row now exists,
      // simulating a race between subscription creation and webhook
      // delivery that has since settled.
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'PENDING',
          razorpaySubscriptionId: subscriptionId,
        },
      });

      // Razorpay's retry: same eventId, same underlying event.
      await processWebhookEvent({
        eventId,
        eventType: 'subscription.activated',
        subscriptionId,
        paymentId: 'pay_test20_retry',
        amount: 14900,
        currency: 'INR',
      });

      const afterRetry = await prisma.webhookEvent.findUnique({ where: { eventId } });
      expect(afterRetry?.status).toBe('SUCCESS');
      expect(afterRetry?.errorMessage).toBeNull();

      const baker = await prisma.baker.findUniqueOrThrow({ where: { id: bakerId } });
      expect(baker.subscriptionStatus).toBe('ACTIVE');

      // Confirms actual reprocessing happened (not just a status flip) -
      // the billing ledger write that only runs on the real success path.
      const billingHistory = await prisma.billingHistory.findFirst({
        where: { subscriptionId, paymentId: 'pay_test20_retry' },
      });
      expect(billingHistory).not.toBeNull();
    });
  });

  describe('Task 3: getBillingStatus exposes isFounderAccount', () => {
    const bakerId = `${TEST_PREFIX}founder-status`;

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'ACTIVE',
          isFounderAccount: true,
          lockedMonthlyPrice: 149,
        },
      });
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
    });

    it('includes isFounderAccount in the response, reflecting the real DB value', async () => {
      const status = await getBillingStatus(bakerId);
      expect(status.isFounderAccount).toBe(true);
    });
  });

  describe('Task 4: timing-safe webhook signature comparison', () => {
    const payload = JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_test20_sig', customer_id: null } } },
    });

    // This local .env has RAZORPAY_WEBHOOK_SECRET unset (empty) - webhook
    // signature verification is normally exercised via a mocked
    // verifySignature (see action18), which never hits this gap. `env` is
    // a plain mutable object (not frozen, not re-read from process.env
    // per call), so overriding this property directly gives
    // verifySignature() a real, known secret to check against, and
    // restoring it afterward avoids leaking state into other test files.
    const TEST_SECRET = 'test-webhook-secret-for-signature-verification';
    const originalSecret = env.RAZORPAY_WEBHOOK_SECRET;

    beforeAll(() => {
      env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
    });

    afterAll(() => {
      env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    });

    function validSignature(): string {
      return crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('hex');
    }

    it('accepts a genuinely valid signature', () => {
      expect(() => razorpayWebhookProcessor.verifySignature(payload, validSignature())).not.toThrow();
    });

    it('rejects a malformed, wrong-length signature cleanly instead of crashing', () => {
      // Previously: crypto.timingSafeEqual throws on mismatched buffer
      // lengths, so a wrong-length header like this would have crashed
      // the handler (an unhandled RangeError) rather than failing
      // verification cleanly.
      expect(() => razorpayWebhookProcessor.verifySignature(payload, 'not-a-valid-signature')).toThrow(
        'Invalid webhook signature',
      );
    });

    it('rejects an empty-string signature cleanly instead of crashing', () => {
      expect(() => razorpayWebhookProcessor.verifySignature(payload, '')).toThrow('Invalid webhook signature');
    });

    it('rejects a same-length but wrong-content signature', () => {
      const valid = validSignature();
      const tampered = (valid[0] === '0' ? '1' : '0') + valid.slice(1);
      expect(() => razorpayWebhookProcessor.verifySignature(payload, tampered)).toThrow(
        'Invalid webhook signature',
      );
    });
  });

  describe('Task 1 follow-up: time-bound PENDING guard (abandoned first-payment recovery)', () => {
    const staleBakerId = `${TEST_PREFIX}pending-stale`;
    const freshBakerId = `${TEST_PREFIX}pending-fresh`;

    afterAll(async () => {
      await deleteTestBakers([staleBakerId, freshBakerId]);
      vi.restoreAllMocks();
    });

    it('a baker PENDING for over 30 minutes is treated as abandoned - createSubscription succeeds and overwrites the stale data', async () => {
      await deleteTestBakers([staleBakerId]);
      await prisma.baker.create({
        data: {
          id: staleBakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'PENDING',
          razorpaySubscriptionId: 'sub_test20_stale_abandoned',
          subscriptionPendingSince: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        },
      });

      const createSpy = vi.spyOn(razorpayGateway, 'createSubscription').mockResolvedValue({
        subscriptionId: 'sub_test20_fresh_reclaim',
        checkoutUrl: 'https://checkout.razorpay.com/v1/checkout.html',
      });

      const result = await createSubscription(staleBakerId, { plan: 'EARLY_ADOPTER' });
      expect(result.subscriptionId).toBe('sub_test20_fresh_reclaim');
      expect(createSpy).toHaveBeenCalledTimes(1);

      const baker = await prisma.baker.findUniqueOrThrow({ where: { id: staleBakerId } });
      expect(baker.subscriptionStatus).toBe('PENDING');
      // The old, never-authorized subscription ID is overwritten by the
      // fresh attempt - not preserved alongside it.
      expect(baker.razorpaySubscriptionId).toBe('sub_test20_fresh_reclaim');
      expect(baker.subscriptionPendingSince).not.toBeNull();
      expect(baker.subscriptionPendingSince!.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('a baker PENDING for only 2 minutes is still correctly rejected - protects the concurrent-double-submit fix', async () => {
      await deleteTestBakers([freshBakerId]);
      await prisma.baker.create({
        data: {
          id: freshBakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'PENDING',
          razorpaySubscriptionId: 'sub_test20_still_fresh',
          subscriptionPendingSince: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        },
      });

      const createSpy = vi.spyOn(razorpayGateway, 'createSubscription');

      await expect(createSubscription(freshBakerId, { plan: 'EARLY_ADOPTER' })).rejects.toThrow(
        'Subscription already active or pending',
      );
      // Rejected before ever reaching Razorpay - same guarantee the
      // per-baker advisory lock provides for the genuinely-concurrent
      // case (a second call racing in milliseconds behind the first has
      // an even fresher subscriptionPendingSince, so it lands in this
      // same rejected branch).
      expect(createSpy).not.toHaveBeenCalled();

      const baker = await prisma.baker.findUniqueOrThrow({ where: { id: freshBakerId } });
      expect(baker.subscriptionStatus).toBe('PENDING');
      expect(baker.razorpaySubscriptionId).toBe('sub_test20_still_fresh');
    });
  });

  describe('Task 2: getBakerProfile exposes isFounderAccount', () => {
    const bakerId = `${TEST_PREFIX}profile-founder-status`;

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'ACTIVE',
          isFounderAccount: true,
        },
      });
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
    });

    it('includes subscription.isFounderAccount in the response, reflecting the real DB value', async () => {
      const profile = await getBakerProfile(bakerId);
      expect(profile.subscription.isFounderAccount).toBe(true);
    });
  });

  describe('Task 1 follow-up: shared getTrialDaysRemaining helper stays consistent across endpoints', () => {
    const bakerId = `${TEST_PREFIX}trial-days-consistency`;

    beforeAll(async () => {
      await deleteTestBakers([bakerId]);
      await prisma.baker.create({
        data: {
          id: bakerId,
          status: 'ACTIVE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000), // ~17.5 days out
        },
      });
    });

    afterAll(async () => {
      await deleteTestBakers([bakerId]);
    });

    it('the shared utility itself is deterministic for a fixed instant', () => {
      const trialEndsAt = new Date('2026-09-01T00:00:00.000Z');
      const now = new Date('2026-08-25T00:00:00.000Z'); // exactly 7 days before
      expect(getTrialDaysRemaining(trialEndsAt, now)).toBe(7);
      // Past trialEndsAt floors at 0, never negative.
      expect(getTrialDaysRemaining(trialEndsAt, new Date('2026-09-10T00:00:00.000Z'))).toBe(0);
      expect(getTrialDaysRemaining(null, now)).toBe(0);
    });

    it('GET /api/billing/status and GET /api/baker/profile report the exact same trialDaysRemaining for the same baker at the same instant', async () => {
      // No frozen clock here (this is a real DB integration test, not a
      // pure unit test - faking global timers risks hanging real
      // Prisma/network I/O that may rely on real timers internally).
      // Both service calls independently call `new Date()`, but firing
      // them concurrently via Promise.all keeps them within the same
      // millisecond-scale window, which is all that matters at
      // day-granularity - the deterministic unit test above already
      // proves the underlying math itself is exact for a fixed instant.
      const [billingStatus, profile] = await Promise.all([
        getBillingStatus(bakerId),
        getBakerProfile(bakerId),
      ]);

      expect(billingStatus.trialDaysRemaining).toBe(profile.subscription.trialDaysRemaining);
      // Sanity: not just "both zero" by coincidence - a real, positive
      // shared value computed from the same trialEndsAt.
      expect(billingStatus.trialDaysRemaining).toBeGreaterThan(0);
    });
  });
});
