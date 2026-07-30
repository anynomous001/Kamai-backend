import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 10 E2E: Cancel / Archive Order', () => {
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
        displayId: 'ORD-DEL-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Mango',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1000,
        advancePaid: 0,
        balanceDue: 1000,
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Cancel Cust',
            phone: '9999999998',
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

  it('should successfully cancel the order and set terminal status', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/orders/ORD-DEL-001',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('Cancelled');

    // Cancelled is a real order_status value now, not a separate soft-delete flag
    const order = await prisma.order.findUnique({
      where: { bakerId_displayId: { bakerId: 'test-baker-id', displayId: 'ORD-DEL-001' } },
    });
    expect(order?.orderStatus).toBe('Cancelled');
  });
});
