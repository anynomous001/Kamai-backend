import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { razorpayGateway } from '../../shared/payment/razorpay.gateway.js';
import { env } from '../../config/env.js';

import type { CreateSubscriptionBody } from './billing.schemas.js';

// Threshold pricing is a live concurrent count, not a lifetime tally:
// while fewer than EARLY_ADOPTER_THRESHOLD bakers currently hold an
// ACTIVE EARLY_ADOPTER_PRICE subscription, new subscriptions are priced
// at EARLY_ADOPTER_PRICE/month; once that many concurrent ACTIVE
// subscribers already exist, new subscriptions are priced at
// STANDARD_PRICE/month. A cancellation frees its slot back up for the
// next subscriber. See migration 20260808140000_concurrent_subscriber_counter.
const EARLY_ADOPTER_THRESHOLD = 149;
const EARLY_ADOPTER_PRICE = 149;
const STANDARD_PRICE = 199;

// Arbitrary, fixed key identifying the "decide subscriber-count pricing"
// critical section for pg_advisory_xact_lock. Any bigint works as long
// as it's used consistently and isn't reused for an unrelated lock.
const SUBSCRIBER_COUNT_LOCK_KEY = 72119001;

function priceForCount(activeEarlyAdopterCount: number): { planCode: 'EARLY_ADOPTER' | 'STANDARD'; price: number } {
  return activeEarlyAdopterCount < EARLY_ADOPTER_THRESHOLD
    ? { planCode: 'EARLY_ADOPTER', price: EARLY_ADOPTER_PRICE }
    : { planCode: 'STANDARD', price: STANDARD_PRICE };
}

export async function getBillingStatus(bakerId: string) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      trialEndsAt: true,
      nextBillingDate: true,
      razorpaySubscriptionId: true,
      lockedMonthlyPrice: true,
    },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  let trialDaysRemaining = 0;
  if (baker.trialEndsAt) {
    const now = new Date();
    const diffTime = baker.trialEndsAt.getTime() - now.getTime();
    trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  // Read-only display value - no lock needed here, unlike the
  // count+decide step in createSubscription, since nothing is being
  // reserved based on this read.
  const currentCount = await prisma.baker.count({
    where: {
      subscriptionStatus: 'ACTIVE',
      lockedMonthlyPrice: EARLY_ADOPTER_PRICE,
      excludeFromSubscriberCount: false,
    },
  });
  const currentOfferPrice = priceForCount(currentCount).price;

  return {
    plan: baker.subscriptionPlan ?? null,
    subscriptionStatus: baker.subscriptionStatus,
    trialDaysRemaining,
    trialEndDate: baker.trialEndsAt ? baker.trialEndsAt.toISOString().split('T')[0] : null,
    nextBillingDate: baker.nextBillingDate ? baker.nextBillingDate.toISOString().split('T')[0] : null,
    autoRenew: baker.razorpaySubscriptionId != null,
    // The price this specific baker actually locked in at subscription
    // creation time - null if they've never had a subscription created.
    // Driven by the stored value rather than a hardcoded constant, since
    // two EARLY_ADOPTER-tier bakers could in principle differ if pricing
    // changes again later.
    lockedMonthlyPrice: baker.lockedMonthlyPrice != null ? Number(baker.lockedMonthlyPrice) : null,
    // What a brand-new subscriber would be offered right now.
    currentOfferPrice,
    spotsRemaining: Math.max(0, EARLY_ADOPTER_THRESHOLD - currentCount),
  };
}

// payload is validated by the route schema (plan must be 'EARLY_ADOPTER')
// but not otherwise used: the actual tier/price is always decided here,
// server-side, from the current concurrent-subscriber count - never from
// the request body.
export async function createSubscription(bakerId: string, _payload: CreateSubscriptionBody) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { subscriptionStatus: true },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  if (baker.subscriptionStatus === 'ACTIVE' || baker.subscriptionStatus === 'PENDING') {
    throw new ConflictError('Subscription already active or pending');
  }

  // Decide the price under an advisory lock, serializing the count+decide
  // step across concurrent requests so two bakers subscribing at nearly
  // the same moment can't both read the same "under threshold" count and
  // both land on the discounted price when only one real slot remains.
  //
  // pg_advisory_xact_lock (transaction-scoped), not the session-scoped
  // pg_advisory_lock, is required here specifically because DATABASE_URL
  // runs through PgBouncer in transaction-pooling mode - a session-scoped
  // lock wouldn't reliably survive PgBouncer handing the underlying
  // connection to a different client between statements, but a
  // transaction-scoped lock is released exactly when the transaction
  // ends, which matches PgBouncer's per-transaction connection lifetime.
  //
  // Deliberately counts only ACTIVE subscribers, not PENDING: a PENDING
  // mandate that's never authorized (baker closes the checkout page,
  // changes their mind, etc.) must not permanently consume a slot the
  // way the old sequence-based counter did - confirmed to happen in
  // practice during production verification. The tradeoff is that a
  // PENDING mandate doesn't reserve its slot either, so a burst of
  // near-simultaneous first-time signups could momentarily all land
  // under the threshold before any of them activate. Accepted: this is a
  // live concurrent count that self-corrects (unlike a lifetime tally),
  // and an occasional few-subscriber overshoot right at the threshold
  // boundary is far less costly than routinely losing real slots to
  // abandoned checkouts, which is the much more common case.
  const { planCode, price } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUBSCRIBER_COUNT_LOCK_KEY})`;
    const activeCount = await tx.baker.count({
      where: {
        subscriptionStatus: 'ACTIVE',
        lockedMonthlyPrice: EARLY_ADOPTER_PRICE,
        excludeFromSubscriberCount: false,
      },
    });
    return priceForCount(activeCount);
  });

  const planId =
    planCode === 'EARLY_ADOPTER' ? env.RAZORPAY_EARLY_ADOPTER_PLAN_ID : env.RAZORPAY_STANDARD_PLAN_ID;
  if (!planId) {
    throw new Error(`Razorpay plan ID is not configured for tier ${planCode}`);
  }

  const result = await razorpayGateway.createSubscription(planId, bakerId);

  await prisma.baker.update({
    where: { id: bakerId },
    data: {
      subscriptionStatus: 'PENDING',
      subscriptionPlan: planCode,
      isEarlyAdopter: planCode === 'EARLY_ADOPTER',
      lockedMonthlyPrice: price,
      razorpaySubscriptionId: result.subscriptionId,
      razorpayPlanId: planId,
    },
  });

  await auditService.logEvent('SUBSCRIPTION_CREATED', bakerId, {
    plan: planCode,
    lockedMonthlyPrice: price,
    razorpaySubscriptionId: result.subscriptionId,
    status: 'PENDING',
  });

  await cacheService.invalidateDashboardSummary(bakerId);

  return {
    subscriptionId: result.subscriptionId,
    keyId: env.RAZORPAY_KEY_ID,
    checkoutUrl: result.checkoutUrl || null,
    plan: planCode,
    monthlyPrice: price,
  };
}
