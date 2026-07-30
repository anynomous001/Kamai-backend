import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 5 E2E: Order History', () => {
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

    // Create a dummy order
    await prisma.order.create({
      data: {
        displayId: 'ORD-HIST-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Vanilla',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1000,
        advancePaid: 500,
        balanceDue: 500,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Dummy Customer',
            phone: '9999999993',
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

  it('should return a paginated list of orders matching query filters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders',
      query: {
        page: 1,
        limit: 10,
        sort: 'createdAt',
        order: 'desc',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.orders).toBeDefined();
    expect(body.data.orders.length).toBeGreaterThanOrEqual(1);
  });
});
