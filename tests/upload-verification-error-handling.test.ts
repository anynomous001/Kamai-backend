import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { storageProvider } from '../src/shared/storage/supabase.storage.js';
import { StorageVerificationError } from '../src/shared/errors/index.js';

/**
 * Covers the diagnosed intermittent-upload-failure bug: both the menu-item
 * photo submit (POST /api/menu-items) and the baker profile picture confirm
 * (POST /api/uploads/confirm) call storageProvider.verifyObjectExists() as a
 * second, independent check *after* the client's direct-to-storage PUT has
 * already completed. These tests prove the route layer now tells apart:
 *  - a transient storage-API failure (must be a distinguishable 503, logged)
 * from
 *  - a genuine "no such object" (stays a 400, the caller's mistake)
 * instead of collapsing both into one generic, unlogged failure.
 */
describe('Upload verification: distinguishing transient storage errors from genuine not-found', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await prisma.menuItem.deleteMany({ where: { bakerId: 'test-baker-id' } });
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await prisma.menuItem.deleteMany({ where: { bakerId: 'test-baker-id' } });
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
  });

  // ── POST /api/menu-items (menu item photo submit) ──────────────────────

  it('returns 503 STORAGE_VERIFICATION_FAILED when the storage service check fails transiently on submit — not a generic error', async () => {
    vi.spyOn(storageProvider, 'verifyObjectExists').mockRejectedValue(
      new StorageVerificationError('Failed to verify uploaded file due to a storage service error', {
        path: 'test-baker-id/menu-item-photos/abc.jpg',
        cause: 'simulated weak-network timeout contacting Supabase Storage',
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: {
        name: 'Chocolate Cake',
        price: 500,
        unit: 'per_kg',
        photoPath: 'test-baker-id/menu-item-photos/abc.jpg',
      },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('STORAGE_VERIFICATION_FAILED');

    // No menu item should have been created when verification couldn't complete.
    const items = await prisma.menuItem.findMany({ where: { bakerId: 'test-baker-id' } });
    expect(items).toHaveLength(0);
  });

  it('still returns 400 BAD_REQUEST when the storage check succeeds but genuinely finds no file — the caller\'s mistake, not ours', async () => {
    vi.spyOn(storageProvider, 'verifyObjectExists').mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: {
        name: 'Chocolate Cake',
        price: 500,
        unit: 'per_kg',
        photoPath: 'test-baker-id/menu-item-photos/never-uploaded.jpg',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('BAD_REQUEST');
  });

  // ── POST /api/uploads/confirm (baker profile picture) ───────────────────

  it('returns 503 STORAGE_VERIFICATION_FAILED for the profile picture confirm call on a transient storage error', async () => {
    vi.spyOn(storageProvider, 'verifyObjectExists').mockRejectedValue(
      new StorageVerificationError('Failed to verify uploaded file due to a storage service error', {
        path: 'test-baker-id/logo/abc.png',
        cause: 'simulated weak-network timeout contacting Supabase Storage',
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads/confirm',
      payload: {
        filePath: 'test-baker-id/logo/abc.png',
        category: 'BUSINESS_LOGO',
      },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('STORAGE_VERIFICATION_FAILED');

    const baker = await prisma.baker.findUnique({ where: { id: 'test-baker-id' } });
    expect(baker?.logoPath).toBeNull();
  });
});
