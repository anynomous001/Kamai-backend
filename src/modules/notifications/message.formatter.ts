export interface OrderData {
  orderNumber: string;
  items: Array<{ name: string; quantity: number }>;
  deliveryDate: Date;
  deliveryType: 'pickup' | 'delivery';
  totalPrice: number;
  advancePaid: number;
  balanceDue: number;
  customerName: string;
  bakerBusinessName: string;
  upiId: string | null;
}

export class MessageFormatter {
  static formatPrice(amountInRupees: number): string {
    return `₹${amountInRupees.toLocaleString('en-IN')}`;
  }

  static formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  static buildOrderSummary(data: OrderData): string {
    const itemsText = data.items
      .map((item) => `🎂 ${item.quantity}x ${item.name}`)
      .join('\n');

    return `${itemsText}
📅 Delivery: ${this.formatDate(data.deliveryDate)}
💰 Total: ${this.formatPrice(data.totalPrice)}
✅ Advance Paid: ${this.formatPrice(data.advancePaid)}
💳 Balance Due: ${this.formatPrice(data.balanceDue)}`;
  }

  static buildPaymentSection(upiId: string | null): string {
    if (!upiId) return '';
    return `UPI:\n${upiId}`;
  }
}
