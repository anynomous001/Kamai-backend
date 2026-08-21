import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { customersService } from '../src/modules/customers/customers.service.js';

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

  // Blank name is unreachable via the HTTP API (createOrderJsonSchema/
  // UpdateOrderBodySchema both require a non-blank name whenever phone is
  // present) - this exercises upsertCustomer directly, the way a
  // direct-script caller (e.g. a bulk historical-order import) would,
  // which bypasses that request-schema layer entirely.
  it('retains the existing stored name when upsertCustomer is called directly with a blank name on a phone match', async () => {
    const phone = '9876500001';

    const created = await prisma.$transaction((tx) =>
      customersService.upsertCustomer(tx, 'test-baker-id', {
        name: 'Real Customer Name',
        phone,
        address: null,
      }),
    );
    expect(created.name).toBe('Real Customer Name');

    const updatedWithBlankName = await prisma.$transaction((tx) =>
      customersService.upsertCustomer(tx, 'test-baker-id', {
        name: '',
        phone,
        address: null,
      }),
    );

    // Same customer row (matched by phone), name untouched by the blank input.
    expect(updatedWithBlankName.id).toBe(created.id);
    expect(updatedWithBlankName.name).toBe('Real Customer Name');

    // A genuinely new, non-blank name still overwrites, exactly as before.
    const updatedWithRealName = await prisma.$transaction((tx) =>
      customersService.upsertCustomer(tx, 'test-baker-id', {
        name: 'Updated Real Name',
        phone,
        address: null,
      }),
    );
    expect(updatedWithRealName.id).toBe(created.id);
    expect(updatedWithRealName.name).toBe('Updated Real Name');

    await prisma.customer.deleteMany({ where: { bakerId: 'test-baker-id', phone } });
  });
});
