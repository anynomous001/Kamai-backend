import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { env } from '../src/config/env.js';

/**
 * Deliberately does NOT mock storageProvider (unlike action26-shareable-menu-link.test.ts).
 * This uploads a real object to the real Supabase bucket, hits the real
 * GET /api/public/menu/:bakerSlug with zero auth, and does a real HTTP
 * fetch of the returned photoUrl — proving the signed URL genuinely
 * works, not just that the field is present.
 */
describe('Action 26b E2E: public menu photoUrl is a real, working signed URL', () => {
  let app: any;
  const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  const testPhotoPath = `test-baker-id/menu-item-photos/real-photo-url-test-${Date.now()}.png`;
  // Smallest possible valid PNG (1x1 transparent pixel), so the uploaded
  // object is a real file with a verifiable, known byte length.
  const testPhotoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    app = await buildApp();

    await prisma.menuItem.deleteMany({ where: { bakerId: 'test-baker-id' } });
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Real Photo Test Bakery',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        menuSlug: 'real-photo-test-bakery',
      },
    });

    const { error: uploadError } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(testPhotoPath, testPhotoBytes, { contentType: 'image/png', upsert: true });
    if (uploadError) {
      throw new Error(`Test setup failed to upload real photo to Supabase: ${uploadError.message}`);
    }

    await prisma.menuItem.create({
      data: {
        bakerId: 'test-baker-id',
        name: 'Real Photo Cake',
        price: 500,
        unit: 'per_kg',
        photoPath: testPhotoPath,
        isAvailable: true,
        sortOrder: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.menuItem.deleteMany({ where: { bakerId: 'test-baker-id' } });
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([testPhotoPath]);
  });

  it('returns a photoUrl that is a genuinely live, fetchable signed URL — with zero auth on the request', async () => {
    // No headers, no cookies, nothing — proves this really is unauthenticated.
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/menu/real-photo-test-bakery',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const photoUrl: string = body.data.items[0].photoUrl;

    expect(photoUrl).toBeTruthy();
    expect(photoUrl).toMatch(/^https:\/\/.*supabase\.co\/storage\/v1\/object\/sign\//);
    expect(photoUrl).not.toContain('mock');

    // The real proof: actually fetch the signed URL over the network and
    // confirm Supabase serves the exact bytes we uploaded.
    const fetched = await fetch(photoUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toContain('image/png');

    const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
    expect(fetchedBytes.equals(testPhotoBytes)).toBe(true);
  });

  it('rejects fetching the same storage object without a valid signature', async () => {
    // Same object, but the raw public object URL (no signature) — proves
    // the bucket is genuinely private and the signature is what's granting
    // access, not an open/public bucket.
    const unsignedUrl = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${testPhotoPath}`;
    const fetched = await fetch(unsignedUrl);
    expect(fetched.status).not.toBe(200);
  });
});
