import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { storageProvider } from '../src/shared/storage/supabase.storage.js';

const MOCK_RECEIPT_URL = 'https://supabase.mock.url/signed-read/receipt.png';

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

    // Mocked, same convention as action20-upload-assets.test.ts — this
    // suite exercises the investments API's own logic (does it verify
    // before saving, does it return/list the URL), not whether Supabase
    // itself works (that's action26b-public-menu-real-photo-url.test.ts's
    // job, for the identical photoPath pattern on menu items).
    vi.spyOn(storageProvider, 'verifyObjectExists').mockResolvedValue(true);
    vi.spyOn(storageProvider, 'getSignedReadUrl').mockResolvedValue(MOCK_RECEIPT_URL);
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
    vi.restoreAllMocks();
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
    // Backward-compatible: no receiptPhotoPath sent, so no receipt.
    expect(body.data.receiptPhotoUrl).toBeNull();
    investmentId = body.data.id;
  });

  it('should record an expense with a receipt photo attached', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/investments',
      payload: {
        category: 'Ingredients',
        materialName: 'Flour',
        quantity: 10,
        unit: 'kg',
        pricePerUnit: 45,
        purchaseDate: '2026-07-27',
        receiptPhotoPath: 'test-baker-id/investment-receipts/mock-receipt.png',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.receiptPhotoUrl).toBe(MOCK_RECEIPT_URL);
    expect(storageProvider.verifyObjectExists).toHaveBeenCalledWith(
      'test-baker-id/investment-receipts/mock-receipt.png',
      expect.objectContaining({ bakerId: 'test-baker-id', category: 'INVESTMENT_RECEIPT' }),
    );
  });

  it('should list recorded investments, including receiptPhotoUrl on the entry that has one', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/investments',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.entries).toBeDefined();
    expect(body.data.entries.length).toBeGreaterThanOrEqual(2);

    const withReceipt = body.data.entries.find((e: any) => e.materialName === 'Flour');
    expect(withReceipt.receiptPhotoUrl).toBe(MOCK_RECEIPT_URL);

    const withoutReceipt = body.data.entries.find((e: any) => e.materialName === 'Butter');
    expect(withoutReceipt.receiptPhotoUrl).toBeNull();
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
