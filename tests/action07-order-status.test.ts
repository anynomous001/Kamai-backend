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

    // Separate order, kept at Pending, for the illegal-skip test below —
    // ORD-STS-001 gets legitimately promoted to Confirmed by the first
    // test, and Confirmed -> Delivered is a valid transition in the
    // current (simplified) Pending/Confirmed/Delivered/Cancelled
    // lifecycle, so that order can no longer stand in for "an illegal
    // skip" the way it did under the old 6-state machine.
    await prisma.order.create({
      data: {
        displayId: 'ORD-STS-002',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Vanilla',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1500,
        advancePaid: 0,
        balanceDue: 1500,
        orderStatus: 'Pending',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Status Cust 2',
            phone: '9999999996',
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

  it('should reject invalid transition status skip (e.g. Pending straight to Delivered)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-002/status',
      payload: {
        status: 'Delivered', // invalid skip from Pending — must go through Confirmed first
      },
    });

    expect(response.statusCode).toBe(409); // Conflict
  });

  it('should allow Confirmed straight to Delivered (simplified lifecycle has no intermediate stages)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-STS-001/status',
      payload: {
        status: 'Delivered', // ORD-STS-001 was promoted to Confirmed by the first test above
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.currentStatus).toBe('Delivered');
  });
});
