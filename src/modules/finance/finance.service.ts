import type { Prisma } from '@prisma/client';
import type { PaymentMode, TransactionType } from '@prisma/client';

export class FinanceService {
  /**
   * Records a financial transaction into the PaymentLedger.
   * This method MUST be called within a Prisma transaction (`tx`) to ensure atomicity
   * with the corresponding order/balance update.
   */
  async recordTransaction(
    tx: Prisma.TransactionClient,
    data: {
      bakerId: string;
      orderId?: string;
      orderNumber?: string;
      amount: number;
      type: TransactionType;
      paymentMode: PaymentMode;
      transactionReference?: string;
    },
  ) {
    return tx.paymentLedger.create({
      data: {
        bakerId: data.bakerId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        amount: data.amount,
        type: data.type,
        paymentMode: data.paymentMode,
        transactionReference: data.transactionReference,
      },
    });
  }
}

export const financeService = new FinanceService();
