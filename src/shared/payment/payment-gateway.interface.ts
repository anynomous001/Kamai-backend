export interface PaymentGateway {
  /**
   * Creates a subscription / recurring payment mandate.
   *
   * @param planId The payment gateway's plan ID
   * @param bakerId The kamai internal baker ID
   * @returns The generated subscription ID and the checkout URL
   */
  createSubscription(
    planId: string,
    bakerId: string
  ): Promise<{ subscriptionId: string; checkoutUrl?: string }>;

  /**
   * Additional methods (cancel, verify webhook) will be added as needed.
   */
}
