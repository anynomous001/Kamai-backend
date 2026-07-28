import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { razorpayGateway } from '../../shared/payment/razorpay.gateway.js';
import { env } from '../../config/env.js';
import type { CreateSubscriptionBody } from './billing.schemas.js';

export async function getBillingStatus(bakerId: string) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      trialStartDate: true,
      trialEndDate: true,
      nextBillingDate: true,
      razorpaySubscriptionId: true,
    },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  let trialDaysRemaining = 0;
  if (baker.trialEndDate) {
    const now = new Date();
    const diffTime = baker.trialEndDate.getTime() - now.getTime();
    trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  return {
    plan: baker.subscriptionPlan ?? null,
    subscriptionStatus: baker.subscriptionStatus,
    trialDaysRemaining,
    trialEndDate: baker.trialEndDate ? baker.trialEndDate.toISOString().split('T')[0] : null,
    nextBillingDate: baker.nextBillingDate ? baker.nextBillingDate.toISOString().split('T')[0] : null,
    autoRenew: baker.razorpaySubscriptionId != null,
  };
}

export async function createSubscription(bakerId: string, payload: CreateSubscriptionBody) {
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

  const planId = env.RAZORPAY_EARLY_ADOPTER_PLAN_ID;
  if (!planId) {
    throw new Error('Razorpay plan ID is not configured');
  }

  const result = await razorpayGateway.createSubscription(planId, bakerId);

  await prisma.baker.update({
    where: { id: bakerId },
    data: {
      subscriptionStatus: 'PENDING',
      subscriptionPlan: payload.plan,
      razorpaySubscriptionId: result.subscriptionId,
      razorpayPlanId: planId,
    },
  });

  await auditService.logEvent('SUBSCRIPTION_CREATED', bakerId, {
    plan: payload.plan,
    razorpaySubscriptionId: result.subscriptionId,
    status: 'PENDING',
  });

  await cacheService.invalidateDashboardSummary(bakerId);

  return {
    subscriptionId: result.subscriptionId,
    keyId: env.RAZORPAY_KEY_ID,
    checkoutUrl: result.checkoutUrl || null,
  };
}
