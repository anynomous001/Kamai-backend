import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { cacheService } from '../../shared/cache/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { CreateInvestmentBody, GetInvestmentsQuery } from './investments.schemas.js';
import { Decimal } from '@prisma/client/runtime/library';

export async function createInvestment(bakerId: string, payload: CreateInvestmentBody) {
  const quantity = new Decimal(payload.quantity);
  const totalCost = Math.round(payload.quantity * payload.pricePerUnit); // Calculate dynamically and store it

  const investment = await prisma.investment.create({
    data: {
      bakerId,
      materialName: payload.materialName,
      quantity,
      unit: payload.unit,
      pricePerUnit: payload.pricePerUnit,
      totalCost,
      supplier: payload.supplier || null,
      purchaseDate: new Date(payload.purchaseDate),
    },
  });

  await auditService.logEvent('INVESTMENT_CREATED', investment.id, {
    bakerId,
    materialName: investment.materialName,
    totalCost: investment.totalCost,
    purchaseDate: investment.purchaseDate,
  });

  await cacheService.invalidateDashboardSummary(bakerId);

  return { id: investment.id };
}

export async function getInvestments(bakerId: string, query: GetInvestmentsQuery) {
  const { from, to, page, limit } = query;
  
  const where: any = {
    bakerId,
    deletedAt: null,
  };

  if (from || to) {
    where.purchaseDate = {};
    if (from) {
      const fromDate = new Date(from);
      fromDate.setUTCHours(0, 0, 0, 0);
      where.purchaseDate.gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setUTCHours(23, 59, 59, 999);
      where.purchaseDate.lte = toDate;
    }
  }

  const [totalItems, dbEntries, aggregated] = await Promise.all([
    prisma.investment.count({ where }),
    prisma.investment.findMany({
      where,
      orderBy: [
        { purchaseDate: 'desc' },
        { createdAt: 'desc' }
      ],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        materialName: true,
        quantity: true,
        unit: true,
        pricePerUnit: true,
        totalCost: true,
        supplier: true,
        purchaseDate: true,
      }
    }),
    prisma.investment.aggregate({
      where,
      _sum: {
        totalCost: true,
      }
    })
  ]);

  const totalPages = Math.ceil(totalItems / limit);
  const totalExpense = aggregated._sum.totalCost || 0;

  const entries = dbEntries.map(entry => ({
    id: entry.id,
    materialName: entry.materialName,
    quantity: entry.quantity.toNumber(),
    unit: entry.unit,
    pricePerUnit: entry.pricePerUnit,
    totalCost: entry.totalCost,
    supplier: entry.supplier,
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
    }
  };
}

export async function deleteInvestment(bakerId: string, entryId: string) {
  const investment = await prisma.investment.findUnique({
    where: { id: entryId, bakerId },
  });

  if (!investment || investment.deletedAt) {
    throw new NotFoundError('Investment not found or already deleted');
  }

  await prisma.investment.update({
    where: { id: entryId },
    data: { deletedAt: new Date() },
  });

  await auditService.logEvent('INVESTMENT_DELETED', investment.id, {
    bakerId,
    materialName: investment.materialName,
    totalCost: investment.totalCost,
    purchaseDate: investment.purchaseDate,
  });

  await cacheService.invalidateDashboardSummary(bakerId);
}
