import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 11 E2E: Customer Upsert', () => {
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

  it('should create a new customer record if phone does not exist, then update LTV (computed) on next order', async () => {
    const payload1 = {
      customer: {
        name: 'CRM Customer',
        phone: '9876543211',
        address: 'CRM Address',
      },
      delivery: { type: 'pickup', date: '2026-10-10', time: '10:00' },
      cake: { category: 'Cake', flavour: 'Vanilla' },
      payment: { totalPrice: 1000, advancePaid: 1000 },
      referencePhotoUrl: null,
    };

    // First order: creates customer, LTV (computed) should become 1000
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: payload1,
    });
    expect(res1.statusCode).toBe(200);

    const customer1 = await prisma.customer.findFirst({
      where: { bakerId: 'test-baker-id', phone: '9876543211' },
    });
    expect(customer1).toBeDefined();

    const profile1 = await app.inject({
      method: 'GET',
      url: `/api/customers/${customer1!.id}`,
    });
    expect(JSON.parse(profile1.body).data.summary.lifetimeValue).toBe(1000);
    expect(JSON.parse(profile1.body).data.summary.totalOrders).toBe(1);

    // Second order: updates same customer, LTV should become 2500
    const payload2 = {
      ...payload1,
      payment: { totalPrice: 1500, advancePaid: 1500 },
    };
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: payload2,
    });
    expect(res2.statusCode).toBe(200);

    const profile2 = await app.inject({
      method: 'GET',
      url: `/api/customers/${customer1!.id}`,
    });
    expect(JSON.parse(profile2.body).data.summary.lifetimeValue).toBe(2500);
    expect(JSON.parse(profile2.body).data.summary.totalOrders).toBe(2);
  });
});
