import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/shared/database/prisma.js';

describe('Inventory Items E2E', () => {
  let app: any;
  const bakerId = 'test-baker-id'; // fixed DEV_BAKER_ID used by the auth bypass in test env

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: bakerId } });
    await prisma.baker.create({
      data: {
        id: bakerId,
        phoneNumber: '+919999999999',
        businessName: 'Inventory Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({ where: { id: bakerId } });
  });

  it('creates an inventory item, lists it, flags low stock, updates and deletes it', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/inventory-items',
      payload: {
        name: 'All Purpose Flour',
        unit: 'kg',
        currentStock: 2,
        lowStockThreshold: 5,
        supplierName: 'Local Mill Co.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body).data;
    expect(created.id).toBeDefined();
    expect(created.displayId).toMatch(/^ITM-/);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/inventory-items',
      query: { lowStockOnly: 'true' },
    });
    expect(listRes.statusCode).toBe(200);
    const listed = JSON.parse(listRes.body).data.items;
    expect(listed.some((i: any) => i.id === created.id && i.isLowStock === true)).toBe(true);

    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/inventory-items/${created.id}`,
      payload: { currentStock: 20 },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).data.currentStock).toBe(20);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/inventory-items/${created.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);

    const afterDelete = await prisma.inventoryItem.findUnique({ where: { id: created.id } });
    expect(afterDelete).toBeNull();
  });
});
