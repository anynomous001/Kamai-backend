import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { storageProvider } from '../src/shared/storage/supabase.storage.js';

describe('Action 20 E2E: Upload Business Assets', () => {
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

    vi.spyOn(storageProvider, 'generateSignedUploadUrl').mockResolvedValue({
      uploadUrl: 'https://supabase.mock.url/signed-upload',
      filePath: 'test-baker-id/logo/mock-file.png',
      expiresIn: 300,
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
    vi.restoreAllMocks();
  });

  it('should generate a signed upload URL for a logo asset', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads/signed-url',
      payload: {
        contentType: 'image/png',
        category: 'BUSINESS_LOGO',
        originalFilename: 'my-logo.png',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toBe('https://supabase.mock.url/signed-upload');
  });
});
