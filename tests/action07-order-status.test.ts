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
        displayId: 'ORD-STS-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Chocolate',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1500,
        advancePaid: 500,
        balanceDue: 1000,
        orderStatus: 'Pending',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Status Cust',
            phone: '9999999995',
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

  it('should successfully transition status from Pending to Confirmed', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-001/status',
      payload: {
        status: 'Confirmed',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.currentStatus).toBe('Confirmed');
  });

  it('should reject invalid transition status skip (e.g. to Delivered directly)', async () => {
    // Current status is now Confirmed due to previous test
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-001/status',
      payload: {
        status: 'Delivered', // invalid skip from Confirmed
      },
    });

    expect(response.statusCode).toBe(409); // Conflict
  });
});
