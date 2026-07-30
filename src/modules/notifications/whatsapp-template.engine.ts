import { WhatsAppNotificationTemplate } from './notifications.schemas.js';
import { MessageFormatter, type OrderData } from './message.formatter.js';

export class WhatsAppTemplateEngine {
  static generateMessage(template: WhatsAppNotificationTemplate, data: OrderData): string {
    const greeting = `Hello ${data.customerName} 👋`;
    const footer = `Thank you,\n${data.bakerBusinessName} ❤️`;
    const orderSummary = MessageFormatter.buildOrderSummary(data);
    const paymentSection = MessageFormatter.buildPaymentSection(data.upiId);
    const fulfilmentMoment = data.deliveryType === 'pickup' ? 'pickup' : 'delivery';

    let purpose = '';
    let callToAction = '';

    switch (template) {
      case WhatsAppNotificationTemplate.ORDER_CONFIRMATION:
        purpose = `Your order #${data.orderNumber} is confirmed!`;
        if (data.balanceDue > 0 && data.upiId) {
          callToAction = `Please note the balance due of ${MessageFormatter.formatPrice(data.balanceDue)}.\n\n${paymentSection}`;
        }
        break;

      case WhatsAppNotificationTemplate.PAYMENT_REMINDER:
        purpose = `This is a reminder for your order #${data.orderNumber}.`;
        if (data.balanceDue > 0 && data.upiId) {
          callToAction = `Kindly complete the remaining payment before ${fulfilmentMoment}.\n\n${paymentSection}`;
        } else if (data.balanceDue > 0) {
          callToAction = `Kindly complete the remaining payment before ${fulfilmentMoment}.`;
        }
        break;

      case WhatsAppNotificationTemplate.READY_FOR_PICKUP: {
        const readyVerb = data.deliveryType === 'pickup' ? 'ready for pickup' : 'ready and out for delivery';
        purpose = `Your order #${data.orderNumber} is ${readyVerb}!`;
        if (data.balanceDue > 0 && data.upiId) {
          callToAction = `Please clear your balance of ${MessageFormatter.formatPrice(data.balanceDue)} at ${fulfilmentMoment} or via UPI:\n\n${paymentSection}`;
        } else if (data.balanceDue > 0) {
          callToAction = `Please clear your balance of ${MessageFormatter.formatPrice(data.balanceDue)} at ${fulfilmentMoment}.`;
        }
        break;
      }

      case WhatsAppNotificationTemplate.RECEIPT:
        purpose = `Here is the receipt for your order #${data.orderNumber}.`;
        if (data.balanceDue <= 0) {
          callToAction = 'Your order is fully paid. Thank you!';
        } else {
          callToAction = `Remaining balance: ${MessageFormatter.formatPrice(data.balanceDue)}`;
        }
        break;

      case WhatsAppNotificationTemplate.THANK_YOU:
        purpose = `We hope you enjoyed your order #${data.orderNumber}!`;
        callToAction = 'We would love to bake for you again soon.';
        // Ensure no payment section is added for THANK_YOU
        break;
    }

    const messageParts = [greeting, purpose, orderSummary];
    if (callToAction) messageParts.push(callToAction);
    messageParts.push(footer);

    return messageParts.join('\n\n');
  }
}
