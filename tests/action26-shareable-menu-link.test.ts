import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { storageProvider } from '../src/shared/storage/supabase.storage.js';
import { generateAndAssignMenuSlug, slugifyBusinessName } from '../src/modules/baker/menu-slug.service.js';

describe('Action 26 E2E: Shareable Menu Link', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    vi.spyOn(storageProvider, 'verifyObjectExists').mockResolvedValue(true);
    vi.spyOn(storageProvider, 'getSignedReadUrl').mockImplementation(async (path: string) =>
      `https://supabase.mock.url/signed-read/${path}`,
    );
  });

  afterAll(async () => {
    await prisma.menuItem.deleteMany({ where: { bakerId: { in: ['test-baker-id', 'test-baker-id-2'] } } });
    await prisma.baker.deleteMany({ where: { id: { in: ['test-baker-id', 'test-baker-id-2'] } } });
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await prisma.menuItem.deleteMany({ where: { bakerId: 'test-baker-id' } });
    await prisma.baker.deleteMany({ where: { id: { in: ['test-baker-id', 'test-baker-id-2'] } } });
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

  // ── slugifyBusinessName ──────────────────────────────────────

  it('slugifies a business name into a URL-safe, hyphenated string', () => {
    expect(slugifyBusinessName("Ananya's Home Bakery!")).toBe('ananya-s-home-bakery');
    expect(slugifyBusinessName('  Sweet   Treats  ')).toBe('sweet-treats');
  });

  // ── POST /api/menu-items — first item lazily publishes the menu ──

  it('generates and assigns a menuSlug from businessName on the first menu item created', async () => {
    const before = await prisma.baker.findUnique({ where: { id: 'test-baker-id' } });
    expect(before?.menuSlug).toBeNull();

    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: 'Chocolate Cake', price: 500, unit: 'per_kg' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Chocolate Cake');
    expect(body.data.isAvailable).toBe(true);
    expect(body.data.sortOrder).toBe(0);

    const after = await prisma.baker.findUnique({ where: { id: 'test-baker-id' } });
    expect(after?.menuSlug).toBe('test-bakery');
  });

  it('does not re-generate menuSlug once already assigned', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { menuSlug: 'already-set' } });

    await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: 'Vanilla Cupcake', price: 40, unit: 'per_piece' },
    });

    const baker = await prisma.baker.findUnique({ where: { id: 'test-baker-id' } });
    expect(baker?.menuSlug).toBe('already-set');
  });

  it('rejects creating a menu item when businessName is unset (400, not a nonsense fallback slug)', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { businessName: null } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: 'Mystery Item', price: 10, unit: 'per_piece' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('appends a numeric suffix on menuSlug collision', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { menuSlug: 'test-bakery' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id-2',
        phoneNumber: '+919999999998',
        businessName: 'Test Bakery',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const slug = await generateAndAssignMenuSlug('test-baker-id-2', 'Test Bakery');
    expect(slug).toBe('test-bakery-2');
  });

  // ── Validation ────────────────────────────────────────────────

  // Body shape is enforced by the Fastify/AJV JSON schema (the Zod schemas
  // in this codebase are type-only, never actually .parse()'d at runtime —
  // same pattern as investments.schemas.ts), so AJV validation failures
  // surface as 422 via error-handler.ts, not 400.

  it('rejects a non-positive price', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: 'Free Cookie', price: 0, unit: 'per_piece' },
    });
    expect(response.statusCode).toBe(422);
  });

  it('rejects an invalid unit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: 'Bad Unit Item', price: 10, unit: 'per_litre' },
    });
    expect(response.statusCode).toBe(422);
  });

  it('rejects an empty name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/menu-items',
      payload: { name: '', price: 10, unit: 'per_piece' },
    });
    expect(response.statusCode).toBe(422);
  });

  // ── GET /api/menu-items — includes unavailable items ─────────

  it('lists all menu items including unavailable ones', async () => {
    await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'Sold Out Item', price: 20, unit: 'per_piece', isAvailable: false, sortOrder: 0 },
    });
    await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'Available Item', price: 20, unit: 'per_piece', isAvailable: true, sortOrder: 1 },
    });

    const response = await app.inject({ method: 'GET', url: '/api/menu-items' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.map((i: any) => i.name).sort()).toEqual(['Available Item', 'Sold Out Item']);
  });

  // ── PUT /api/menu-items/:id ───────────────────────────────────

  it('updates a menu item and can toggle isAvailable', async () => {
    const item = await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'Red Velvet', price: 600, unit: 'per_kg', sortOrder: 0 },
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/menu-items/${item.id}`,
      payload: { isAvailable: false, price: 650 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.isAvailable).toBe(false);
    expect(body.data.price).toBe(650);
  });

  it('returns 404 updating a menu item that does not belong to the baker', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/menu-items/00000000-0000-0000-0000-000000000000',
      payload: { price: 100 },
    });
    expect(response.statusCode).toBe(404);
  });

  // ── DELETE /api/menu-items/:id ────────────────────────────────

  it('deletes a menu item, and 404s deleting it again', async () => {
    const item = await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'To Delete', price: 100, unit: 'per_piece', sortOrder: 0 },
    });

    const first = await app.inject({ method: 'DELETE', url: `/api/menu-items/${item.id}` });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'DELETE', url: `/api/menu-items/${item.id}` });
    expect(second.statusCode).toBe(404);
  });

  // ── PUT /api/menu-items/reorder ───────────────────────────────

  it('reorders menu items to match the given array position', async () => {
    const a = await prisma.menuItem.create({ data: { bakerId: 'test-baker-id', name: 'A', price: 10, unit: 'per_piece', sortOrder: 0 } });
    const b = await prisma.menuItem.create({ data: { bakerId: 'test-baker-id', name: 'B', price: 10, unit: 'per_piece', sortOrder: 1 } });
    const c = await prisma.menuItem.create({ data: { bakerId: 'test-baker-id', name: 'C', price: 10, unit: 'per_piece', sortOrder: 2 } });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/menu-items/reorder',
      payload: { menuItemIds: [c.id, a.id, b.id] },
    });

    expect(response.statusCode).toBe(200);
    const items = await prisma.menuItem.findMany({ where: { bakerId: 'test-baker-id' }, orderBy: { sortOrder: 'asc' } });
    expect(items.map((i) => i.name)).toEqual(['C', 'A', 'B']);
  });

  it('rejects reorder when the id set does not exactly match the current items', async () => {
    const a = await prisma.menuItem.create({ data: { bakerId: 'test-baker-id', name: 'A', price: 10, unit: 'per_piece', sortOrder: 0 } });
    await prisma.menuItem.create({ data: { bakerId: 'test-baker-id', name: 'B', price: 10, unit: 'per_piece', sortOrder: 1 } });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/menu-items/reorder',
      payload: { menuItemIds: [a.id] }, // missing B
    });

    expect(response.statusCode).toBe(400);
  });

  // ── GET /api/public/menu/:bakerSlug — the unauthenticated route ──

  it('returns 404 for an unknown menu slug', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/public/menu/no-such-baker' });
    expect(response.statusCode).toBe(404);
  });

  it('serves only available items, with only the whitelisted fields, never exposing internal ids', async () => {
    await prisma.baker.update({
      where: { id: 'test-baker-id' },
      data: { menuSlug: 'public-test-bakery', whatsappNumber: '9876543210', logoPath: 'test-baker-id/logo/pic.png' },
    });
    await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'Visible Cake', category: 'Cakes', price: 500, unit: 'per_kg', description: 'Yum', isAvailable: true, sortOrder: 0 },
    });
    await prisma.menuItem.create({
      data: { bakerId: 'test-baker-id', name: 'Sold Out Cake', price: 500, unit: 'per_kg', isAvailable: false, sortOrder: 1 },
    });

    const response = await app.inject({ method: 'GET', url: '/api/public/menu/public-test-bakery' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.data.businessName).toBe('Test Bakery');
    expect(body.data.whatsappNumber).toBe('9876543210');
    expect(body.data.logoUrl).toContain('signed-read');
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].name).toBe('Visible Cake');

    // Structured key check, not a raw substring check — the mocked signed
    // logoUrl legitimately embeds the storage path convention
    // (`{bakerId}/logo/...`, see uploads.service.ts), which is expected
    // and not a leak; what actually must never appear is an `id`/`bakerId`/
    // `menuItemId` *field* on the response or its items.
    expect(body.data).not.toHaveProperty('id');
    expect(body.data).not.toHaveProperty('bakerId');
    for (const item of body.data.items) {
      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('menuItemId');
      expect(item).not.toHaveProperty('bakerId');
    }
    expect(body.data.items.some((i: any) => i.name === 'Sold Out Cake')).toBe(false);
  });

  it('is a case-insensitive lookup on the slug', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { menuSlug: 'case-test-bakery' } });

    const response = await app.inject({ method: 'GET', url: '/api/public/menu/CASE-Test-Bakery' });
    expect(response.statusCode).toBe(200);
  });

  // ── PATCH /api/baker/menu-slug — one-time edit ────────────────

  it('allows editing the menu slug once, then rejects a second edit', async () => {
    await prisma.baker.update({ where: { id: 'test-baker-id' }, data: { menuSlug: 'original-slug' } });

    const first = await app.inject({
      method: 'PATCH',
      url: '/api/baker/menu-slug',
      payload: { menuSlug: 'my-custom-link' },
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).data.menuSlug).toBe('my-custom-link');

    const second = await app.inject({
      method: 'PATCH',
      url: '/api/baker/menu-slug',
      payload: { menuSlug: 'another-attempt' },
    });
    expect(second.statusCode).toBe(400);
  });

  it('rejects editing the menu slug to one already taken by another baker', async () => {
    await prisma.baker.create({
      data: {
        id: 'test-baker-id-2',
        phoneNumber: '+919999999997',
        businessName: 'Other Bakery',
        menuSlug: 'taken-slug',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/baker/menu-slug',
      payload: { menuSlug: 'taken-slug' },
    });

    expect(response.statusCode).toBe(400);
  });

  // ── GET /api/baker/profile exposes menu section ───────────────

  it("surfaces menuSlug/menuSlugEditable/whatsappNumber on the baker profile", async () => {
    await prisma.baker.update({
      where: { id: 'test-baker-id' },
      data: { menuSlug: 'profile-check-bakery', whatsappNumber: '9123456780' },
    });

    const response = await app.inject({ method: 'GET', url: '/api/baker/profile' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.menu.menuSlug).toBe('profile-check-bakery');
    expect(body.data.menu.menuSlugEditable).toBe(true);
    expect(body.data.menu.whatsappNumber).toBe('9123456780');
  });
});
