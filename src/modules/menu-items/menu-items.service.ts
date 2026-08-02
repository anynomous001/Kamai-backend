import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';
import { generateAndAssignMenuSlug } from '../baker/menu-slug.service.js';

import type { CreateMenuItemBody, UpdateMenuItemBody } from './menu-items.schemas.js';

const PHOTO_URL_EXPIRES_IN_SECONDS = 3600; // 1 hour — matches baker logo pattern; regenerated fresh on every read

type MenuItemRecord = {
  id: string;
  name: string;
  category: string | null;
  price: unknown; // Prisma.Decimal
  unit: string;
  description: string | null;
  photoPath: string | null;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

async function toResponse(item: MenuItemRecord) {
  const photoUrl = item.photoPath
    ? await storageProvider.getSignedReadUrl(item.photoPath, PHOTO_URL_EXPIRES_IN_SECONDS)
    : null;

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    unit: item.unit,
    description: item.description,
    photoUrl,
    isAvailable: item.isAvailable,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function verifyPhotoPath(photoPath: string, context: Record<string, unknown>): Promise<void> {
  const exists = await storageProvider.verifyObjectExists(photoPath, context);
  if (!exists) {
    throw new BadRequestError('photoPath does not point to an uploaded file — upload via /api/uploads/signed-url first');
  }
}

async function ensureMenuSlug(bakerId: string): Promise<void> {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { menuSlug: true, businessName: true },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  if (!baker.menuSlug) {
    await generateAndAssignMenuSlug(bakerId, baker.businessName);
  }
}

export async function createMenuItem(bakerId: string, payload: CreateMenuItemBody) {
  if (payload.photoPath) {
    await verifyPhotoPath(payload.photoPath, { bakerId, category: 'MENU_ITEM_PHOTO', op: 'createMenuItem' });
  }

  // First menu item "publishes" the menu — lazily assign the shareable slug.
  await ensureMenuSlug(bakerId);

  const maxSortOrder = await prisma.menuItem.aggregate({
    where: { bakerId },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  const item = await prisma.menuItem.create({
    data: {
      bakerId,
      name: payload.name,
      category: payload.category ?? null,
      price: payload.price,
      unit: payload.unit,
      description: payload.description ?? null,
      photoPath: payload.photoPath ?? null,
      sortOrder: nextSortOrder,
    },
  });

  await auditService.logEvent('MENU_ITEM_CREATED', item.id, {
    bakerId,
    name: item.name,
    price: Number(item.price),
    unit: item.unit,
  });

  return toResponse(item);
}

export async function getMenuItems(bakerId: string) {
  const items = await prisma.menuItem.findMany({
    where: { bakerId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return { items: await Promise.all(items.map(toResponse)) };
}

export async function updateMenuItem(bakerId: string, id: string, payload: UpdateMenuItemBody) {
  const existing = await prisma.menuItem.findFirst({
    where: { id, bakerId },
  });

  if (!existing) {
    throw new NotFoundError('Menu item not found');
  }

  if (payload.photoPath) {
    await verifyPhotoPath(payload.photoPath, { bakerId, category: 'MENU_ITEM_PHOTO', op: 'updateMenuItem', menuItemId: id });
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {}),
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.photoPath !== undefined ? { photoPath: payload.photoPath } : {}),
      ...(payload.isAvailable !== undefined ? { isAvailable: payload.isAvailable } : {}),
    },
  });

  await auditService.logEvent('MENU_ITEM_UPDATED', updated.id, {
    bakerId,
    changes: payload,
  });

  return toResponse(updated);
}

export async function deleteMenuItem(bakerId: string, id: string): Promise<void> {
  const existing = await prisma.menuItem.findFirst({
    where: { id, bakerId },
  });

  if (!existing) {
    throw new NotFoundError('Menu item not found');
  }

  await prisma.menuItem.delete({ where: { id } });

  await auditService.logEvent('MENU_ITEM_DELETED', id, {
    bakerId,
    name: existing.name,
  });
}

export async function reorderMenuItems(bakerId: string, menuItemIds: string[]) {
  const currentItems = await prisma.menuItem.findMany({
    where: { bakerId },
    select: { id: true },
  });

  const currentIds = new Set(currentItems.map((i) => i.id));
  const requestedIds = new Set(menuItemIds);

  if (
    currentIds.size !== requestedIds.size ||
    menuItemIds.some((id) => !currentIds.has(id))
  ) {
    throw new BadRequestError('menuItemIds must contain exactly the full current set of this baker\'s menu item ids, with no duplicates or foreign ids');
  }

  await prisma.$transaction(
    menuItemIds.map((id, index) =>
      prisma.menuItem.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  await auditService.logEvent('MENU_ITEMS_REORDERED', bakerId, {
    bakerId,
    orderedIds: menuItemIds,
  });

  return getMenuItems(bakerId);
}
