import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { storageProvider } from '../src/shared/storage/supabase.storage.js';

describe('POST /api/orders/:orderNumber/receipt-image', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { bakerId: { in: ['test-baker-id', 'test-baker-id-other'] } } });
    await prisma.baker.deleteMany({ where: { id: { in: ['test-baker-id', 'test-baker-id-other'] } } });
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await prisma.order.deleteMany({ where: { bakerId: { in: ['test-baker-id', 'test-baker-id-other'] } } });
    await prisma.baker.deleteMany({ where: { id: { in: ['test-baker-id', 'test-baker-id-other'] } } });

    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: "Ananya's Home Bakery",
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        whatsappReceiptEnabled: true,
      },
    });

    await prisma.order.create({
      data: {
        displayId: 'ORD-RCPT-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Chocolate Truffle',
        weightInPounds: 2,
        quantity: 1,
        deliveryType: 'delivery',
        deliveryDate: new Date('2026-08-18'),
        totalPrice: 1800,
        advancePaid: 500,
        balanceDue: 1300,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Priya Sharma',
            phone: '9999999995',
          },
        },
      },
    });
  });

  it('generates a receipt image and returns a signed URL for a balance-due order', async () => {
    vi.spyOn(storageProvider, 'uploadObject').mockResolvedValue({ filePath: 'receipt-images/test-baker-id/mock.png' });
    vi.spyOn(storageProvider, 'getSignedReadUrl').mockResolvedValue('https://supabase.mock.url/signed-read/receipt.png');

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/ORD-RCPT-001/receipt-image',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.orderNumber).toBe('ORD-RCPT-001');
    expect(body.data.imageUrl).toBe('https://supabase.mock.url/signed-read/receipt.png');
    expect(body.data.expiresIn).toBe(3600);

    // uploaded to a stable per-order path (upsert-friendly — see KI-008)
    expect(storageProvider.uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^receipt-images\/test-baker-id\/.+\.png$/),
      expect.any(Buffer),
      'image/png',
    );
  }, 15000);

  it('generates a paid-in-full receipt image without a balance-due amount', async () => {
    await prisma.order.update({
      where: { bakerId_displayId: { bakerId: 'test-baker-id', displayId: 'ORD-RCPT-001' } },
      data: { advancePaid: 1800, balanceDue: 0, paymentStatus: 'Paid' },
    });
    vi.spyOn(storageProvider, 'uploadObject').mockResolvedValue({ filePath: 'receipt-images/test-baker-id/mock.png' });
    vi.spyOn(storageProvider, 'getSignedReadUrl').mockResolvedValue('https://supabase.mock.url/signed-read/receipt.png');

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/ORD-RCPT-001/receipt-image',
    });

    expect(response.statusCode).toBe(200);
  }, 15000);

  it('returns 403 WHATSAPP_RECEIPT_DISABLED when the baker has turned the toggle off, without touching storage', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { whatsappReceiptEnabled: false } });
    const uploadSpy = vi.spyOn(storageProvider, 'uploadObject').mockResolvedValue({ filePath: 'unused.png' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/ORD-RCPT-001/receipt-image',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('WHATSAPP_RECEIPT_DISABLED');
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent order number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/ORD-DOES-NOT-EXIST/receipt-image',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 (not another baker\'s data) when the order belongs to a different baker', async () => {
    await prisma.baker.create({
      data: {
        id: 'test-baker-id-other',
        phoneNumber: '+919999999998',
        businessName: 'Someone Else\'s Bakery',
        ownerName: 'Other Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
    await prisma.order.create({
      data: {
        displayId: 'ORD-RCPT-OTHER',
        baker: { connect: { id: 'test-baker-id-other' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Vanilla',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 900,
        advancePaid: 0,
        balanceDue: 900,
        customer: { create: { bakerId: 'test-baker-id-other', name: 'Other Customer', phone: '9999999996' } },
      },
    });

    // authenticated as test-baker-id (DEV_BAKER_ID) requesting an order
    // that belongs to test-baker-id-other
    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/ORD-RCPT-OTHER/receipt-image',
    });

    expect(response.statusCode).toBe(404);
  });
});
