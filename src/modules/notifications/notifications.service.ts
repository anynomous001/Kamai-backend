import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';

import { WhatsAppNotificationTemplate } from './notifications.schemas.js';
import { WhatsAppTemplateEngine } from './whatsapp-template.engine.js';
import { DeepLinkGenerator } from './deep-link.generator.js';
import type { OrderData } from './message.formatter.js';

export async function generateWhatsAppMessage(
  bakerId: string,
  orderId: string,
  template: WhatsAppNotificationTemplate,
) {
  // 1. Fetch Order with Customer and Baker
  const order = await prisma.order.findFirst({
    where: { id: orderId, bakerId },
    include: {
      customer: true,
      baker: true,
    },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  if (!order.customer.phone) {
    throw new BadRequestError('Customer phone number is required.');
  }

  // whatsappReceiptEnabled is a soft default only — it controls whether
  // receipts are suggested/pre-filled by default, not whether a RECEIPT
  // message can be sent. An explicit request for this template must
  // always be honored.

  // 2. Build OrderData
  const cakeDescription = order.weightInPounds
    ? `${order.cakeFlavour} ${order.cakeCategory} (${order.weightInPounds} lb)`
    : `${order.cakeFlavour} ${order.cakeCategory}`;

  const orderData: OrderData = {
    orderNumber: order.displayId,
    items: [
      {
        name: cakeDescription,
        quantity: order.quantity ? Number(order.quantity) : 1,
      },
    ],
    deliveryDate: order.deliveryDate,
    deliveryType: order.deliveryType as 'pickup' | 'delivery',
    totalPrice: Number(order.totalPrice),
    advancePaid: Number(order.advancePaid),
    balanceDue: Number(order.balanceDue),
    customerName: order.customer.name,
    bakerBusinessName: order.baker.businessName || 'Your Baker',
    upiId: order.baker.upiVpa,
  };

  // 3. Generate Message
  const rawMessage = WhatsAppTemplateEngine.generateMessage(template, orderData);

  // 4. Generate Deep Link
  const whatsappUrl = DeepLinkGenerator.generateWhatsAppUrl(order.customer.phone, rawMessage);

  // 5. Audit Log
  const now = new Date();
  await auditService.logEvent('WHATSAPP_LINK_GENERATED', bakerId, {
    orderId: order.id,
    orderNumber: orderData.orderNumber,
    template,
    generatedAt: now.toISOString(),
  });

  return {
    template,
    orderNumber: orderData.orderNumber,
    whatsappUrl,
    generatedAt: now.toISOString(),
  };
}
