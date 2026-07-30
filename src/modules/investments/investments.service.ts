import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { NotFoundError } from '../../shared/errors/index.js';

import type { CreateInvestmentBody, GetInvestmentsQuery } from './investments.schemas.js';

export async function createInvestment(bakerId: string, payload: CreateInvestmentBody) {
  const totalCost = Math.round(payload.quantity * payload.pricePerUnit * 100) / 100; // server-computed, never trust client

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

  return { id: investment.id, displayId: investment.displayId };
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
      },
    }),
    prisma.investment.aggregate({
      where,
      _sum: { totalCost: true },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit);
  const totalExpense = aggregated._sum.totalCost ? Number(aggregated._sum.totalCost) : 0;

  const entries = dbEntries.map((entry) => ({
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
  }));

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
