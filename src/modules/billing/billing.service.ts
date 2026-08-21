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

// Namespace for the per-baker advisory lock below, used with the
// two-int32-key form pg_advisory_xact_lock(int, int) - a completely
// separate Postgres lock space from the single-bigint form used by
// SUBSCRIBER_COUNT_LOCK_KEY above. Postgres keeps these two lock spaces
// independent regardless of the numeric values chosen, so this can never
// collide with, or unnecessarily serialize against, the pricing-count
// lock. Any int32 works as the namespace; hashtext(bakerId) supplies the
// per-baker half of the key.
const PER_BAKER_SUBSCRIPTION_LOCK_NAMESPACE = 810199;

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
      isFounderAccount: true,
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
    // Surfaced so a founder/comp account is distinguishable from a real
    // paying subscriber in the API response - previously this field was
    // never returned, so e.g. subscriptionStatus: 'ACTIVE' with a real-
    // looking lockedMonthlyPrice could read as a genuine live
    // subscription with no signal otherwise (flagged in the 2026-08-21
    // audit).
    isFounderAccount: baker.isFounderAccount,
  };
}

// payload is validated by the route schema (plan must be 'EARLY_ADOPTER')
// but not otherwise used: the actual tier/price is always decided here,
// server-side, from the current concurrent-subscriber count - never from
// the request body.
export async function createSubscription(bakerId: string, _payload: CreateSubscriptionBody) {
  const { planCode, price, subscriptionId, checkoutUrl } = await prisma.$transaction(
    async (tx) => {
      // Per-baker advisory lock, held for the ENTIRE operation below
      // (guard read, pricing decision, the Razorpay API call, and the
      // final baker.update) by acquiring it first thing inside this one
      // transaction. Without this, two concurrent createSubscription
      // calls for the SAME baker (double-click, client retry-before-
      // response, two open tabs) could both pass the ACTIVE/PENDING
      // guard before either had written PENDING, both call Razorpay's
      // createSubscription independently, and race on the final update -
      // silently orphaning one live Razorpay mandate that our DB stops
      // tracking (confirmed as a real race in the 2026-08-21 audit; a
      // sequential version of this exact symptom - two live subscription
      // IDs for one baker - was found on a real account earlier that
      // session). A second concurrent call now blocks on this lock until
      // the first call's entire operation, including its Razorpay
      // round-trip, has committed, then re-reads subscriptionStatus and
      // correctly hits the ConflictError below instead.
      // Postgres's two-int32-key pg_advisory_xact_lock(int, int) requires
      // BOTH args as int4 - Prisma binds a plain JS number parameter as
      // bigint by default, which doesn't match that overload
      // (pg_advisory_xact_lock(bigint, integer) doesn't exist), so the
      // namespace constant needs an explicit ::int cast. hashtext()
      // already returns int4 natively.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PER_BAKER_SUBSCRIPTION_LOCK_NAMESPACE}::int, hashtext(${bakerId}))`;

      const baker = await tx.baker.findUnique({
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
      // abandoned checkouts, which is the much more common case. This
      // lock's scope is deliberately kept narrow - just the count+decide
      // step below - even though it now runs inside the same transaction
      // as the per-baker lock above, rather than its own separate
      // transaction as before.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUBSCRIBER_COUNT_LOCK_KEY})`;
      const activeCount = await tx.baker.count({
        where: {
          subscriptionStatus: 'ACTIVE',
          lockedMonthlyPrice: EARLY_ADOPTER_PRICE,
          excludeFromSubscriberCount: false,
        },
      });
      const { planCode, price } = priceForCount(activeCount);

      const planId =
        planCode === 'EARLY_ADOPTER' ? env.RAZORPAY_EARLY_ADOPTER_PLAN_ID : env.RAZORPAY_STANDARD_PLAN_ID;
      if (!planId) {
        throw new Error(`Razorpay plan ID is not configured for tier ${planCode}`);
      }

      const result = await razorpayGateway.createSubscription(planId, bakerId);

      await tx.baker.update({
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

      return { planCode, price, subscriptionId: result.subscriptionId, checkoutUrl: result.checkoutUrl };
    },
    // Generous timeout: this transaction now holds the per-baker lock
    // across a real Razorpay HTTP round-trip, not just local DB work, so
    // Prisma's 5s interactive-transaction default would risk aborting a
    // legitimate-but-slow call. maxWait is how long a second concurrent
    // caller for the same baker will wait to even start (i.e. to acquire
    // a connection and begin waiting on the advisory lock) before Prisma
    // gives up client-side.
    { timeout: 15000, maxWait: 10000 },
  );

  await auditService.logEvent('SUBSCRIPTION_CREATED', bakerId, {
    plan: planCode,
    lockedMonthlyPrice: price,
    razorpaySubscriptionId: subscriptionId,
    status: 'PENDING',
  });

  await cacheService.invalidateDashboardSummary(bakerId);

  return {
    subscriptionId,
    keyId: env.RAZORPAY_KEY_ID,
    checkoutUrl: checkoutUrl || null,
    plan: planCode,
    monthlyPrice: price,
  };
}

// This endpoint only triggers the cancellation at Razorpay; it deliberately
// never writes subscriptionStatus itself. The subscription.cancelled webhook
// (webhooks.service.ts) is the sole source of truth for that transition, the
// same way subscription.activated is the only thing that ever sets ACTIVE.
// razorpayCustomerId/SubscriptionId/PlanId are never cleared here either -
// they're preserved as historical linkage even after cancellation.
export async function cancelSubscription(bakerId: string) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { subscriptionStatus: true, razorpaySubscriptionId: true },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  if (
    baker.razorpaySubscriptionId == null ||
    baker.subscriptionStatus === 'CANCELLED' ||
    baker.subscriptionStatus === 'EXPIRED'
  ) {
    throw new ConflictError('No active subscription to cancel');
  }

  // Cancel at the end of the current billing cycle rather than immediately:
  // the baker already paid for this cycle, so Razorpay keeps the mandate
  // live (and the webhook status ACTIVE) until the cycle actually ends,
  // then sends subscription.cancelled.
  const result = await razorpayGateway.cancelSubscription(baker.razorpaySubscriptionId, true);

  await auditService.logEvent('SUBSCRIPTION_CANCEL_REQUESTED', bakerId, {
    razorpaySubscriptionId: baker.razorpaySubscriptionId,
    cancelAtCycleEnd: true,
    razorpayStatus: result.status,
  });

  return {
    subscriptionId: result.subscriptionId,
    cancelAtCycleEnd: true,
    razorpayStatus: result.status,
  };
}
