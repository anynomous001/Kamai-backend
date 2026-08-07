import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { razorpayGateway } from '../../shared/payment/razorpay.gateway.js';
import { env } from '../../config/env.js';

import type { CreateSubscriptionBody } from './billing.schemas.js';

// The first EARLY_ADOPTER_THRESHOLD paid subscriptions ever created (i.e.
// nextval('paid_subscription_counter') <= threshold) are priced at
// EARLY_ADOPTER_PRICE/month; every subscription created after that is
// priced at STANDARD_PRICE/month. See migration
// 20260807000000_update_trial_length_and_pricing for the sequence.
const EARLY_ADOPTER_THRESHOLD = 149;
const EARLY_ADOPTER_PRICE = 149;
const STANDARD_PRICE = 199;

// Peeks at the sequence's current position WITHOUT consuming a slot, so
// GET /billing/status can show "what a new subscriber would pay right now"
// without affecting the threshold. A freshly created sequence reports
// is_called = false (nothing has consumed it yet), meaning 0 subscriptions
// have been counted so far.
async function getPaidSubscriptionCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`
    SELECT last_value, is_called FROM paid_subscription_counter
  `;
  if (rows.length === 0) return 0;
  const row = rows[0];
  if (!row.is_called) return 0;
  return Number(row.last_value);
}

function priceForCount(countBeforeThisOne: number): { planCode: 'EARLY_ADOPTER' | 'STANDARD'; price: number } {
  return countBeforeThisOne < EARLY_ADOPTER_THRESHOLD
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

  const currentCount = await getPaidSubscriptionCount();
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
// server-side, from the current paid-subscriber count - never from the
// request body.
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

  // Atomically reserve this subscription's position in line. nextval() is
  // safe under concurrency without an explicit row lock - two bakers
  // subscribing at nearly the same moment cannot both be handed the same
  // count, which is what actually prevents both from landing under the
  // threshold when only one discounted slot remains. This must happen at
  // creation time (before Razorpay/the webhook), because pricing has to be
  // decided before the mandate is created - waiting for webhook-confirmed
  // activation to count would reopen the same race.
  //
  // Tradeoff (accepted): if this subscription-creation attempt fails after
  // this point (e.g. the Razorpay API call below fails), the reserved
  // count is not returned to the pool - sequence values are not
  // transactional. A slot can be permanently consumed by an abandoned
  // attempt.
  const seqRows = await prisma.$queryRaw<{ seq: bigint }[]>`
    SELECT nextval('paid_subscription_counter') AS seq
  `;
  const position = Number(seqRows[0].seq);
  const { planCode, price } = priceForCount(position - 1);

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
