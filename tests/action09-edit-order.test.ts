import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 9 E2E: Edit Order Details', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });

    await prisma.order.create({
      data: {
        displayId: 'ORD-EDT-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Vanilla',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1000,
        advancePaid: 300,
        balanceDue: 700,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Edit Cust',
            phone: '9999999997',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully edit order and update balance calculations', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/orders/ORD-EDT-001',
      payload: {
        customer: {
          name: 'Edit Cust',
          phone: '9999999997',
          address: 'New Mansion',
        },
        cake: {
          category: 'Cake',
          flavour: 'Chocolate Fudge',
        },
        delivery: {
          type: 'pickup',
          date: '2026-11-20',
          time: '12:00',
        },
        payment: {
          totalPrice: 1500, // increased price
          advancePaid: 300, // advance unchanged
        },
        referencePhotoUrl: 'https://newphoto.com',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.balanceDue).toBe(1200); // 1500 - 300
  });
});
