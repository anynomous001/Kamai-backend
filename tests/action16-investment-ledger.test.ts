import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 16 E2E: Investment / Expense Ledger', () => {
  let app: any;
  let investmentId: string;

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

  it('should successfully record a raw material purchase expense', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/investments',
      payload: {
        category: 'Ingredients',
        materialName: 'Butter',
        quantity: 5,
        unit: 'kg',
        pricePerUnit: 400,
        supplierName: 'Amul distributor',
        purchaseDate: '2026-07-26',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    investmentId = body.data.id;
  });

  it('should list recorded investments', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/investments',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.entries).toBeDefined();
    expect(body.data.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('should accept page/limit as HTTP query-string values (regression: these arrive as strings, not integers)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/investments?page=1&limit=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(10);
  });

  it('should delete a recorded investment expense', async () => {
    expect(investmentId).toBeDefined();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/investments/${investmentId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
