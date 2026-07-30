import type { Prisma } from '@prisma/client';

export type PaymentEventType = 'advance_received' | 'balance_received' | 'refund';
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER';

export class FinanceService {
  /**
   * Records a payment event into the payment_events ledger.
   * This method MUST be called within a Prisma transaction (`tx`) to ensure atomicity
   * with the corresponding order/balance update.
   */
  async recordTransaction(
    tx: Prisma.TransactionClient,
    data: {
      bakerId: string;
      orderId?: string;
      amount: number;
      eventType: PaymentEventType;
      paymentMode: PaymentMode;
      transactionReference?: string;
    },
  ) {
    return tx.paymentEvent.create({
      data: {
        bakerId: data.bakerId,
        orderId: data.orderId,
        amount: data.amount,
        eventType: data.eventType,
        paymentMode: data.paymentMode,
        transactionReference: data.transactionReference,
      },
    });
  }
}

export const financeService = new FinanceService();
