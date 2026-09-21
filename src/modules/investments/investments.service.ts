import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js';

import type { CreateInvestmentBody, GetInvestmentsQuery } from './investments.schemas.js';

// 1 hour — matches the identical menu-items.service.ts / baker-profile
// pattern: regenerated fresh on every read rather than stored, since the
// storage bucket is private and a stored URL would just expire.
const RECEIPT_PHOTO_URL_EXPIRES_IN_SECONDS = 3600;

export async function createInvestment(bakerId: string, payload: CreateInvestmentBody) {
  const totalCost = Math.round(payload.quantity * payload.pricePerUnit * 100) / 100; // server-computed, never trust client

  if (payload.receiptPhotoPath) {
    const exists = await storageProvider.verifyObjectExists(payload.receiptPhotoPath, {
      bakerId,
      category: 'INVESTMENT_RECEIPT',
      op: 'createInvestment',
    });
    if (!exists) {
      throw new BadRequestError('receiptPhotoPath does not point to an uploaded file — upload via /api/uploads/signed-url first');
    }
  }

  const investment = await prisma.investment.create({
    data: {
      bakerId,
      category: payload.category,
      description: payload.description,
      materialName: payload.materialName,
      quantity: payload.quantity,
      unit: payload.unit,
      pricePerUnit: payload.pricePerUnit,
      totalCost,
      supplierName: payload.supplierName || null,
      purchaseDate: new Date(`${payload.purchaseDate}T00:00:00.000Z`),
      receiptPhotoPath: payload.receiptPhotoPath || null,
    },
  });

  await auditService.logEvent('INVESTMENT_CREATED', investment.id, {
    bakerId,
    materialName: investment.materialName,
    category: investment.category,
    totalCost: Number(investment.totalCost),
    purchaseDate: investment.purchaseDate,
  });

  await cacheService.invalidateDashboardSummary(bakerId);

  const receiptPhotoUrl = investment.receiptPhotoPath
    ? await storageProvider.getSignedReadUrl(investment.receiptPhotoPath, RECEIPT_PHOTO_URL_EXPIRES_IN_SECONDS)
    : null;

  return { id: investment.id, displayId: investment.displayId, receiptPhotoUrl };
}

export async function getInvestments(bakerId: string, query: GetInvestmentsQuery) {
  const { from, to, category } = query;
  // Query-string values arrive as strings over real HTTP even though the
  // JSON schema also accepts integers — coerce explicitly, same as
  // orders/customers/dashboard already do.
  const page = Number(query.page);
  const limit = Number(query.limit);

  const where: any = {
    bakerId,
    deletedAt: null,
  };

  if (category) {
    where.category = category;
  }

  if (from || to) {
    where.purchaseDate = {};
    if (from) {
      where.purchaseDate.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to) {
      where.purchaseDate.lte = new Date(`${to}T23:59:59.999Z`);
    }
  }

  const [totalItems, dbEntries, aggregated] = await Promise.all([
    prisma.investment.count({ where }),
    prisma.investment.findMany({
      where,
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        displayId: true,
        category: true,
        description: true,
        materialName: true,
        quantity: true,
        unit: true,
        pricePerUnit: true,
        totalCost: true,
        supplierName: true,
        purchaseDate: true,
        receiptPhotoPath: true,
      },
    }),
    prisma.investment.aggregate({
      where,
      _sum: { totalCost: true },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit);
  const totalExpense = aggregated._sum.totalCost ? Number(aggregated._sum.totalCost) : 0;

  // Signed read URLs are generated fresh per entry (same as
  // menu-items.service.ts's getMenuItems) rather than stored — the bucket
  // is private, so there's no stable URL to cache here.
  const entries = await Promise.all(
    dbEntries.map(async (entry) => ({
      id: entry.id,
      displayId: entry.displayId,
      category: entry.category,
      description: entry.description,
      materialName: entry.materialName,
      quantity: Number(entry.quantity),
      unit: entry.unit,
      pricePerUnit: Number(entry.pricePerUnit),
      totalCost: Number(entry.totalCost),
      supplierName: entry.supplierName,
      purchaseDate: entry.purchaseDate.toISOString().split('T')[0],
      receiptPhotoUrl: entry.receiptPhotoPath
        ? await storageProvider.getSignedReadUrl(entry.receiptPhotoPath, RECEIPT_PHOTO_URL_EXPIRES_IN_SECONDS)
        : null,
    })),
  );

  return {
    entries,
    summary: { totalExpense },
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

export async function deleteInvestment(bakerId: string, entryId: string) {
  const investment = await prisma.investment.findUnique({
    where: { id: entryId, bakerId },
  });

  if (!investment || investment.deletedAt) {
    throw new NotFoundError('Investment not found or already deleted');
  }

  await prisma.investment.updateMany({
    where: { id: entryId, bakerId },
    data: { deletedAt: new Date() },
  });

  await auditService.logEvent('INVESTMENT_DELETED', investment.id, {
    bakerId,
    materialName: investment.materialName,
    totalCost: Number(investment.totalCost),
    purchaseDate: investment.purchaseDate,
  });

  await cacheService.invalidateDashboardSummary(bakerId);
}
