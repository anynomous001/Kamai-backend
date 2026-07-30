import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 14 E2E: Update Customer Profile', () => {
  let app: any;
  let customerId: string;

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

    const cust = await prisma.customer.create({
      data: {
        bakerId: 'test-baker-id',
        name: 'Charlie Update',
        phone: '9876543214',
      },
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully update customer name and notes', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/customers/${customerId}`,
      payload: {
        name: 'Charlie Updated Name',
        phone: '9876543214',
        address: 'New Charlie Mansion',
        notes: 'Likes extra cream',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Charlie Updated Name');
    expect(body.data.address).toBe('New Charlie Mansion');
  });
});
