import type { FastifyInstance } from 'fastify';

import {
  createMenuItemHandler,
  getMenuItemsHandler,
  updateMenuItemHandler,
  deleteMenuItemHandler,
  reorderMenuItemsHandler,
} from './menu-items.controller.js';
import {
  createMenuItemJsonSchema,
  getMenuItemsJsonSchema,
  updateMenuItemJsonSchema,
  deleteMenuItemJsonSchema,
  reorderMenuItemsJsonSchema,
} from './menu-items.schemas.js';

/**
 * Menu Items Routes (Action 26 — Shareable Menu Link)
 * Prefix: /api/menu-items
 * All routes here are authenticated, baker-scoped management routes.
 * The public, unauthenticated read is in modules/public-menu.
 */
export async function menuItemsRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: createMenuItemJsonSchema,
    preHandler: [app.authenticate],
    handler: createMenuItemHandler,
  });

  app.get('/', {
    schema: getMenuItemsJsonSchema,
    preHandler: [app.authenticate],
    handler: getMenuItemsHandler,
  });

  // Registered before '/:id' so the literal path always wins the match,
  // though find-my-way already prioritizes static routes over parametric
  // ones regardless of order.
  app.put('/reorder', {
    schema: reorderMenuItemsJsonSchema,
    preHandler: [app.authenticate],
    handler: reorderMenuItemsHandler,
  });

  app.put('/:id', {
    schema: updateMenuItemJsonSchema,
    preHandler: [app.authenticate],
    handler: updateMenuItemHandler,
  });

  app.delete('/:id', {
    schema: deleteMenuItemJsonSchema,
    preHandler: [app.authenticate],
    handler: deleteMenuItemHandler,
  });
}
