import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type {
  CreateInventoryItemBody,
  GetInventoryItemsQuery,
  UpdateInventoryItemBody,
} from './inventory.schemas.js';

export class InventoryService {
  async createItem(bakerId: string, payload: CreateInventoryItemBody) {
    const item = await prisma.inventoryItem.create({
      data: {
        bakerId,
        name: payload.name,
        unit: payload.unit,
        currentStock: payload.currentStock,
        lowStockThreshold: payload.lowStockThreshold,
        supplierName: payload.supplierName,
        lastPurchaseDate: payload.lastPurchaseDate ? new Date(`${payload.lastPurchaseDate}T00:00:00.000Z`) : null,
      },
    });

    await auditService.logEvent('INVENTORY_ITEM_CREATED', item.id, { bakerId, name: item.name });

    return { id: item.id, displayId: item.displayId };
  }

  async getItems(bakerId: string, query: GetInventoryItemsQuery) {
    const { page, limit, search, lowStockOnly } = query;

    const where: any = { bakerId };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // current_stock <= low_stock_threshold is a same-row column comparison,
    // which the Prisma filter DSL can't express directly — fetch all matches
    // and filter/paginate in memory. Fine at seed-data scale (10-15 items/baker).
    const allItems = await prisma.inventoryItem.findMany({ where, orderBy: { name: 'asc' } });

    let mapped = allItems.map((item) => ({
      id: item.id,
      displayId: item.displayId,
      name: item.name,
      unit: item.unit,
      currentStock: Number(item.currentStock),
      lowStockThreshold: item.lowStockThreshold ? Number(item.lowStockThreshold) : null,
      isLowStock: item.lowStockThreshold != null && Number(item.currentStock) <= Number(item.lowStockThreshold),
      supplierName: item.supplierName,
      lastPurchaseDate: item.lastPurchaseDate ? item.lastPurchaseDate.toISOString().slice(0, 10) : null,
    }));

    if (lowStockOnly) {
      mapped = mapped.filter((item) => item.isLowStock);
    }

    const totalItems = mapped.length;
    const totalPages = Math.ceil(totalItems / limit);
    const pageSlice = mapped.slice((page - 1) * limit, page * limit);

    return {
      items: pageSlice,
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

  async updateItem(bakerId: string, itemId: string, payload: UpdateInventoryItemBody) {
    const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId, bakerId } });
    if (!existing) {
      throw new NotFoundError('Inventory item not found');
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        name: payload.name,
        unit: payload.unit,
        currentStock: payload.currentStock,
        lowStockThreshold: payload.lowStockThreshold,
        supplierName: payload.supplierName,
        lastPurchaseDate:
          payload.lastPurchaseDate === undefined
            ? undefined
            : payload.lastPurchaseDate === null
              ? null
              : new Date(`${payload.lastPurchaseDate}T00:00:00.000Z`),
      },
    });

    await auditService.logEvent('INVENTORY_ITEM_UPDATED', updated.id, { bakerId, fieldsChanged: Object.keys(payload) });

    return {
      id: updated.id,
      displayId: updated.displayId,
      name: updated.name,
      unit: updated.unit,
      currentStock: Number(updated.currentStock),
      lowStockThreshold: updated.lowStockThreshold ? Number(updated.lowStockThreshold) : null,
      supplierName: updated.supplierName,
      lastPurchaseDate: updated.lastPurchaseDate ? updated.lastPurchaseDate.toISOString().slice(0, 10) : null,
    };
  }

  async deleteItem(bakerId: string, itemId: string) {
    const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId, bakerId } });
    if (!existing) {
      throw new NotFoundError('Inventory item not found');
    }

    await prisma.inventoryItem.deleteMany({ where: { id: itemId, bakerId } });

    await auditService.logEvent('INVENTORY_ITEM_DELETED', itemId, { bakerId, name: existing.name });
  }
}

export const inventoryService = new InventoryService();
