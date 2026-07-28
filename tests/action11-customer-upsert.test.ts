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
        firebaseUid: 'test-fb-baker-id',
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

  it('should create a new customer record if phone does not exist, then update LTV on next order', async () => {
    const payload1 = {
      customer: {
        name: 'CRM Customer',
        phone: '+919876543211',
        address: 'CRM Address',
      },
      delivery: { date: '2026-10-10', time: '10:00' },
      cake: { category: 'Cake', weight: '1kg', flavour: 'Vanilla' },
      payment: { totalPrice: 100000, advancePaid: 100000 },
      referencePhoto: null,
    };

    // First order: creates customer, LTV should become 100000
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: payload1,
    });
    expect(res1.statusCode).toBe(200);

    const customer1 = await prisma.customer.findFirst({
      where: { bakerId: 'test-baker-id', phone: '+919876543211' },
    });
    expect(customer1?.lifetimeValue).toBe(100000);
    expect(customer1?.totalOrders).toBe(1);

    // Second order: updates same customer, LTV should become 250000
    const payload2 = {
      ...payload1,
      payment: { totalPrice: 150000, advancePaid: 150000 },
    };
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: payload2,
    });
    expect(res2.statusCode).toBe(200);

    const customer2 = await prisma.customer.findFirst({
      where: { bakerId: 'test-baker-id', phone: '+919876543211' },
    });
    expect(customer2?.lifetimeValue).toBe(250000);
    expect(customer2?.totalOrders).toBe(2);
  });
});
