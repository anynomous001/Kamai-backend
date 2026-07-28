import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 7 E2E: Update Order Status', () => {
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
        orderNumber: 'ORD-STS-001',
        baker: { connect: { id: 'test-baker-id' } },
        category: 'Cake',
        weight: '1kg',
        flavour: 'Chocolate',
        deliveryDate: new Date(),
        totalPrice: 150000,
        advancePaid: 50000,
        balanceDue: 100000,
        status: 'PENDING',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Status Cust',
            phone: '+919999999995',
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

  it('should successfully transition status from PENDING to CONFIRMED', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-001/status',
      payload: {
        status: 'CONFIRMED',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.currentStatus).toBe('CONFIRMED');
  });

  it('should reject invalid transition status skip (e.g. to DELIVERED directly)', async () => {
    // Current status is now CONFIRMED due to previous test
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-001/status',
      payload: {
        status: 'DELIVERED', // invalid skip from CONFIRMED
      },
    });

    expect(response.statusCode).toBe(409); // Conflict
  });
});
