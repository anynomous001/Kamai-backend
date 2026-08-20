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
   * Cancels a subscription / recurring payment mandate at the gateway.
   * This only triggers the cancellation upstream — it does not update any
   * local subscription state, which stays the responsibility of the
   * webhook that Razorpay sends back once the cancellation takes effect.
   *
   * @param subscriptionId The payment gateway's subscription ID
   * @param cancelAtCycleEnd If true, the subscription keeps running (and
   *   charging) through the end of the current billing cycle and only
   *   cancels after that; if false, it cancels immediately.
   * @returns The subscription ID and the gateway's resulting status
   */
  cancelSubscription(
    subscriptionId: string,
    cancelAtCycleEnd: boolean
  ): Promise<{ subscriptionId: string; status: string }>;

  /**
   * Additional methods (verify webhook) will be added as needed.
   */
}
