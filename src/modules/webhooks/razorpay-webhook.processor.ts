import crypto from 'crypto';

import { z } from 'zod';

import { env } from '../../config/env.js';

import type { WebhookProcessor } from './webhook.processor.interface.js';

const razorpayWebhookPayloadSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z
      .object({
        entity: z.object({
          id: z.string(),
          // Razorpay sends this as explicit JSON null (not just omitted)
          // when no customer entity is attached to the subscription -
          // .optional() alone only accepts undefined, not null, so it was
          // rejecting every real payload outright. Confirmed against a
          // real subscription.charged/activated/cancelled payload.
          customer_id: z.string().nullable().optional(),
        }),
      })
      .optional(),
    payment: z
      .object({
        entity: z.object({
          id: z.string(),
          amount: z.number(),
          currency: z.string(),
        }),
      })
      .optional(),
  }),
});

export class RazorpayWebhookProcessor implements WebhookProcessor {
  verifySignature(payload: string, signature: string): void {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('Webhook secret is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new Error('Invalid webhook signature');
    }
  }

  parseEvent(payload: string): ReturnType<WebhookProcessor['parseEvent']> {
    const parseResult = razorpayWebhookPayloadSchema.safeParse(JSON.parse(payload));

    if (!parseResult.success) {
      throw new Error('Invalid webhook payload: unexpected shape');
    }

    const data = parseResult.data;
    const subscriptionEntity = data.payload.subscription?.entity;
    const paymentEntity = data.payload.payment?.entity;

    if (!subscriptionEntity) {
      throw new Error('Invalid webhook payload: missing subscription entity');
    }

    return {
      // Event ID is passed from the controller via header; overridden there.
      eventId: '',
      eventType: data.event,
      subscriptionId: subscriptionEntity.id,
      customerId: subscriptionEntity.customer_id,
      paymentId: paymentEntity?.id,
      amount: paymentEntity?.amount, // in paise
      currency: paymentEntity?.currency ?? 'INR',
    };
  }
}

export const razorpayWebhookProcessor = new RazorpayWebhookProcessor();
