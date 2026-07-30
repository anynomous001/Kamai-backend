import type { FastifyInstance } from 'fastify';

import {
  createInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
} from './inventory.controller.js';
import {
  createInventoryItemJsonSchema,
  getInventoryItemsJsonSchema,
  updateInventoryItemJsonSchema,
  deleteInventoryItemJsonSchema,
} from './inventory.schemas.js';

/**
 * Inventory Routes
 * Prefix: /api/inventory-items
 */
export async function inventoryRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: createInventoryItemJsonSchema,
    preHandler: [app.authenticate],
    handler: createInventoryItem,
  });

  app.get('/', {
    schema: getInventoryItemsJsonSchema,
    preHandler: [app.authenticate],
    handler: getInventoryItems,
  });

  app.put('/:itemId', {
    schema: updateInventoryItemJsonSchema,
    preHandler: [app.authenticate],
    handler: updateInventoryItem,
  });

  app.delete('/:itemId', {
    schema: deleteInventoryItemJsonSchema,
    preHandler: [app.authenticate],
    handler: deleteInventoryItem,
  });
}
