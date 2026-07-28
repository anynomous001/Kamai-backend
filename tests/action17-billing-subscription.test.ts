import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayGateway } from '../src/shared/payment/razorpay.gateway.js';

describe('Action 17 E2E: Billing & Subscription', () => {
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
        subscriptionStatus: 'TRIAL',
      }
    });

    // Mock Razorpay SDK subscription creation
    vi.spyOn(razorpayGateway, 'createSubscription').mockResolvedValue({
      subscriptionId: 'sub_mock_12345',
      checkoutUrl: 'https://checkout.razorpay.com/v1/checkout.html',
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
    vi.restoreAllMocks();
  });

  it('should get current billing status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/billing/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.subscriptionStatus).toBeDefined();
  });

  it('should successfully initiate subscription creation via Razorpay mock', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/create-subscription',
      payload: {
        plan: 'EARLY_ADOPTER',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.subscriptionId).toBe('sub_mock_12345');
    expect(body.data.checkoutUrl).toBeDefined();
  });
});
