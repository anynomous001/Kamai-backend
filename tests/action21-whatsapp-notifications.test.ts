import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 21 E2E: WhatsApp Notifications Link Generation', () => {
  let app: any;
  let orderId: string;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        firebaseUid: 'test-fb-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: 'ORD-NOT-001',
        baker: { connect: { id: 'test-baker-id' } },
        category: 'Cake',
        weight: '1kg',
        flavour: 'Marble',
        deliveryDate: new Date(),
        totalPrice: 100000,
        advancePaid: 50000,
        balanceDue: 50000,
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Notify Cust',
            phone: '+919999999990',
          },
        },
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully generate a WhatsApp link containing the prefilled message template', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notifications/whatsapp',
      payload: {
        orderId,
        template: 'PAYMENT_REMINDER',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.whatsappUrl).toContain('https://wa.me/');
  });
});
