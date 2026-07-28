import crypto from 'crypto';
import { env } from '../../config/env.js';
import type { WebhookProcessor } from './webhook.processor.interface.js';

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

  parseEvent(payload: string) {
    const data = JSON.parse(payload);
    
    // The Razorpay event ID is often in the 'x-razorpay-event-id' header, 
    // but here we are parsing the body. The processor will just extract what it can.
    // Actually, Razorpay doesn't put event ID in the body, it's only in headers.
    // Wait, let's extract the necessary entity info.
    const eventType = data.event;
    const subscriptionEntity = data.payload?.subscription?.entity;
    const paymentEntity = data.payload?.payment?.entity;

    if (!subscriptionEntity || !subscriptionEntity.id) {
      throw new Error('Invalid webhook payload: missing subscription entity');
    }

    return {
      // Event ID is passed from the controller via header, we'll just return what's in the payload.
      // We will override eventId in the controller.
      eventId: '', 
      eventType,
      subscriptionId: subscriptionEntity.id,
      paymentId: paymentEntity?.id,
      amount: paymentEntity?.amount, // in paise
      currency: paymentEntity?.currency || 'INR',
    };
  }
}

export const razorpayWebhookProcessor = new RazorpayWebhookProcessor();
