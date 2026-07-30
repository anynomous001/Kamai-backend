import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 4 E2E: Create New Order', () => {
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
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully create an order and upsert the customer in a transaction', async () => {
    const payload = {
      customer: {
        name: 'Jane Doe',
        phone: '9999999992',
        address: '456 Sweet St',
      },
      delivery: {
        type: 'delivery',
        date: '2026-12-25',
        time: '18:00',
      },
      cake: {
        category: 'Cupcake',
        flavour: 'Strawberry',
        weightInPounds: 1.1,
      },
      payment: {
        totalPrice: 2000,
        advancePaid: 500,
      },
      referencePhotoUrl: null,
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.orderNumber).toBeDefined();
    expect(body.data.balanceDue).toBe(1500);
  });
});
