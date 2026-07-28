import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { razorpayWebhookProcessor } from '../src/modules/webhooks/razorpay-webhook.processor.js';

describe('Action 18 E2E: Razorpay Webhook Processing', () => {
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
        razorpaySubscriptionId: 'sub_mock_12345',
      }
    });

    // Mock signature verification and parsing
    vi.spyOn(razorpayWebhookProcessor, 'verifySignature').mockImplementation(() => {});
    vi.spyOn(razorpayWebhookProcessor, 'parseEvent').mockReturnValue({
      eventId: 'evt_mock_123',
      eventType: 'subscription.charged',
      subscriptionId: 'sub_mock_12345',
      paymentId: 'pay_mock_123',
      amount: 4900,
      currency: 'INR',
    });
  });

  afterAll(async () => {
    await prisma.billingHistory.deleteMany({
      where: { bakerId: 'test-baker-id' },
    });
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
    // Clean up webhook events
    await prisma.webhookEvent.deleteMany({
      where: { eventId: 'evt_mock_123' },
    });
    vi.restoreAllMocks();
  });

  it('should process subscription.charged event successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/razorpay',
      headers: {
        'x-razorpay-signature': 'mock-signature',
        'x-razorpay-event-id': 'evt_mock_123',
      },
      payload: {
        mock: 'payload',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    // Verify baker subscription status updated to ACTIVE in DB
    const baker = await prisma.baker.findUnique({
      where: { id: 'test-baker-id' },
    });
    expect(baker?.subscriptionStatus).toBe('ACTIVE');
  });
});
