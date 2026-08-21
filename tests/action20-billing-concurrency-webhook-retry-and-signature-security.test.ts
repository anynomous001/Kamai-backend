import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';
import { createSubscription } from '../src/modules/billing/billing.service.js';

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
});
