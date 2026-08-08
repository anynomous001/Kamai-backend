import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { logger } from '../../shared/logger/index.js';

export async function processWebhookEvent(event: {
  eventId: string;
  eventType: string;
  subscriptionId: string;
  customerId?: string | null;
  paymentId?: string;
  amount?: number;
  currency?: string;
}): Promise<void> {
  const { eventId, eventType, subscriptionId, customerId, paymentId, amount, currency } = event;

  // Known subscription states map
  const stateMap: Record<string, 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED'> = {
    'subscription.activated': 'ACTIVE',
    'subscription.charged': 'ACTIVE',
    'subscription.halted': 'PAUSED',
    'subscription.cancelled': 'CANCELLED',
    'subscription.completed': 'EXPIRED',
  };

  const newState = stateMap[eventType];
  if (!newState) {
    logger.info(`Ignored unknown webhook event: ${eventType}`);
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      const existingEvent = await tx.webhookEvent.findUnique({
        where: { eventId },
      });

      if (existingEvent) {
        logger.info(`Webhook event ${eventId} already processed.`);
        return; // Already processed
      }

      // 2. Find Baker by subscription ID
      const baker = await tx.baker.findUnique({
        where: { razorpaySubscriptionId: subscriptionId },
        select: { id: true, subscriptionStatus: true },
      });

      if (!baker) {
        logger.error(`Baker not found for subscription ID: ${subscriptionId}`);
        throw new Error('Baker not found');
      }

      // 3. Update Subscription State
      // Actually, we shouldn't change the nextBillingDate directly unless Razorpay sends it.
      // We will just update the status.
      await tx.baker.update({
        where: { id: baker.id },
        data: {
          subscriptionStatus: newState,
          ...(customerId != null ? { razorpayCustomerId: customerId } : {}),
        },
      });

      // 4. Insert Billing History
      await tx.billingHistory.create({
        data: {
          bakerId: baker.id,
          subscriptionId,
          paymentId,
          eventType,
          amount: amount ?? 0,
          currency: currency ?? 'INR',
          status: 'SUCCESS',
          processedAt: new Date(),
        },
      });

      // 5. Insert Webhook Event
      await tx.webhookEvent.create({
        data: {
          eventId,
          eventType,
          status: 'SUCCESS',
        },
      });

      // 6. Audit Log
      const auditActionMap: Record<string, string> = {
        'subscription.activated': 'SUBSCRIPTION_ACTIVATED',
        'subscription.charged': 'SUBSCRIPTION_RENEWED',
        'subscription.halted': 'SUBSCRIPTION_PAUSED',
        'subscription.cancelled': 'SUBSCRIPTION_CANCELLED',
        'subscription.completed': 'SUBSCRIPTION_EXPIRED',
      };

      await auditService.logEvent(auditActionMap[eventType] || eventType, baker.id, {
        subscriptionId,
        paymentId,
        eventType,
      });

      // 7. Invalidate Cache
      await cacheService.invalidateDashboardSummary(baker.id);
    });
  } catch (error: unknown) {
    // We try to log the failure in webhook event table if possible, outside transaction
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Webhook processing failed: ${msg}`);

    try {
      await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType,
          status: 'FAILED',
          errorMessage: msg,
        },
      });
    } catch (e) {
      // Ignore if it fails due to unique constraint (another process might have saved it)
    }

    throw error;
  }
}
