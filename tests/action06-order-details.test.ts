import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 6 E2E: View Order Details', () => {
  let app: any;

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

    await prisma.order.create({
      data: {
        orderNumber: 'ORD-DTL-001',
        baker: { connect: { id: 'test-baker-id' } },
        category: 'Cake',
        weight: '1.5kg',
        flavour: 'Pineapple',
        deliveryDate: new Date(),
        totalPrice: 120000,
        advancePaid: 60000,
        balanceDue: 60000,
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'John Pineapple',
            phone: '+919999999994',
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

  it('should successfully retrieve detailed order details by orderNumber', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-DTL-001',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.orderId).toBe('ORD-DTL-001');
    expect(body.data.cake.flavour).toBe('Pineapple');
  });

  it('should return 404 for non-existent order number', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-NONEXISTENT',
    });

    expect(response.statusCode).toBe(404);
  });
});
