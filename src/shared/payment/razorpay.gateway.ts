import Razorpay from 'razorpay';

import { env } from '../../config/env.js';
import { InternalServerError } from '../errors/index.js';

import type { PaymentGateway } from './payment-gateway.interface.js';

export class RazorpayGateway implements PaymentGateway {
  private razorpay: Razorpay | null = null;

  private getClient(): Razorpay {
    if (!this.razorpay) {
      if (env.RAZORPAY_KEY_ID == null || env.RAZORPAY_KEY_SECRET == null) {
        throw new InternalServerError('Razorpay credentials are not configured');
      }
      this.razorpay = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET,
      });
    }
    return this.razorpay;
  }

  async createSubscription(
    planId: string,
    bakerId: string
  ): Promise<{ subscriptionId: string; checkoutUrl?: string }> {
    try {
      const client = this.getClient();
      const subscription = await client.subscriptions.create({
        plan_id: planId,
        total_count: 120, // Example: 10 years for a monthly plan
        customer_notify: 1,
        notes: {
          bakerId,
        },
      });

      return {
        subscriptionId: subscription.id,
        checkoutUrl: subscription.short_url,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerError(`Failed to create Razorpay subscription: ${msg}`);
    }
  }

  // Razorpay's SDK exposes `cancel(subscriptionId, cancelAtCycleEnd)`, which
  // posts `{ cancel_at_cycle_end: 1 }` when true — the subscription keeps
  // billing through the current cycle and Razorpay sends the
  // `subscription.cancelled` webhook once it actually ends, instead of
  // cutting the baker off mid-cycle they already paid for.
  async cancelSubscription(
    subscriptionId: string,
    cancelAtCycleEnd: boolean
  ): Promise<{ subscriptionId: string; status: string }> {
    try {
      const client = this.getClient();
      const subscription = await client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);

      return {
        subscriptionId: subscription.id,
        status: subscription.status,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerError(`Failed to cancel Razorpay subscription: ${msg}`);
    }
  }
}

export const razorpayGateway = new RazorpayGateway();
