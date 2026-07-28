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

  // 2. Build OrderData
  const orderData: OrderData = {
    orderNumber: order.orderNumber,
    items: [
      {
        name: `${order.flavour} ${order.category} (${order.weight})`,
        quantity: 1,
      },
    ],
    deliveryDate: order.deliveryDate,
    totalPrice: order.totalPrice,
    advancePaid: order.advancePaid,
    balanceDue: order.balanceDue,
    customerName: order.customer.name,
    bakerBusinessName: order.baker.businessName || 'Your Baker',
    upiId: order.baker.upiId,
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
