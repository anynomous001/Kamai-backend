export interface WebhookProcessor {
  /**
   * Verifies the webhook signature.
   * Throws an error if the signature is invalid.
   */
  verifySignature(payload: string, signature: string): void;

  /**
   * Parses the webhook payload into a standardized event format.
   */
  parseEvent(payload: string): {
    eventId: string;
    eventType: string;
    subscriptionId: string;
    customerId?: string | null;
    paymentId?: string;
    amount?: number;
    currency?: string;
  };
}
