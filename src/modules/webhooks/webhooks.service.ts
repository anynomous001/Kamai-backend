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
      // 1. Idempotency Check - only short-circuits on a previously
      // SUCCESSFUL delivery of this exact eventId. A FAILED row (e.g. a
      // transient "Baker not found" from a prior delivery attempt) is
      // deliberately NOT treated as "already processed": checking
      // existence alone here used to mean Razorpay's automatic retry of
      // a genuinely failed event would hit this FAILED row, get silently
      // short-circuited, and return 200 - permanently defeating the
      // retry mechanism with no error and no alert (confirmed in the
      // 2026-08-21 audit). Falling through here lets a retry actually
      // re-attempt processing once the underlying condition (e.g. the
      // baker row committing) has resolved.
      const existingEvent = await tx.webhookEvent.findUnique({
        where: { eventId },
      });

      if (existingEvent?.status === 'SUCCESS') {
        logger.info(`Webhook event ${eventId} already processed.`);
        return; // Already processed
      }

      if (existingEvent?.status === 'FAILED') {
        logger.info(
          `Webhook event ${eventId} previously failed (${existingEvent.errorMessage ?? 'unknown error'}) - retrying.`,
        );
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

      // 4. Insert Billing History - deduplicated on subscriptionId +
      // paymentId + eventType. The eventId-level idempotency check above
      // only catches the exact same webhook delivery being replayed; it
      // does not catch Razorpay sending two different event IDs for what
      // is functionally the same charge (confirmed in production: two
      // subscription.activated webhooks, same subscriptionId + paymentId,
      // ~4 seconds apart, each with a distinct eventId, both logged as
      // separate BillingHistory rows). A genuinely new billing cycle
      // reuses the same subscriptionId but always carries a new paymentId
      // from Razorpay, so this key never collides across real charges -
      // only across duplicate deliveries of the same one.
      const isDuplicateBillingEvent =
        paymentId != null &&
        (await tx.billingHistory.findFirst({
          where: { subscriptionId, paymentId, eventType },
          select: { id: true },
        })) != null;

      if (isDuplicateBillingEvent) {
        logger.info(
          `Skipped duplicate BillingHistory write for subscription ${subscriptionId}, payment ${paymentId}, event ${eventType} (eventId ${eventId})`,
        );
      } else {
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
      }

      // 5. Insert/Update Webhook Event - upsert, not create, since a
      // successful retry targets a row that may already exist (in
      // FAILED status) from a prior failed attempt at this same eventId.
      await tx.webhookEvent.upsert({
        where: { eventId },
        create: {
          eventId,
          eventType,
          status: 'SUCCESS',
        },
        update: {
          eventType,
          status: 'SUCCESS',
          errorMessage: null,
          processedAt: new Date(),
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
      // Upsert, not create: a second or later failed attempt at the same
      // eventId now targets a row that already exists (either FAILED
      // from an earlier attempt, or - in the unlikely case processing
      // failed after the transaction's own upsert already ran - SUCCESS,
      // which this correctly overwrites back to FAILED with the real
      // error, since that attempt did not actually complete).
      await prisma.webhookEvent.upsert({
        where: { eventId },
        create: {
          eventId,
          eventType,
          status: 'FAILED',
          errorMessage: msg,
        },
        update: {
          eventType,
          status: 'FAILED',
          errorMessage: msg,
          processedAt: new Date(),
        },
      });
    } catch (e) {
      // Best-effort only - never let a failure to record the failure
      // itself mask or replace the original processing error below.
    }

    throw error;
  }
}
