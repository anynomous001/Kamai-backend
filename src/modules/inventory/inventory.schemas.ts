import { z } from 'zod';

export const CreateInventoryItemBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  unit: z.string().min(1, 'Unit is required'),
  currentStock: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0).optional(),
  supplierName: z.string().optional(),
  lastPurchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
});

export type CreateInventoryItemBody = z.infer<typeof CreateInventoryItemBodySchema>;

export const createInventoryItemJsonSchema = {
  description: 'Add a new inventory item (ingredient/packaging/etc.)',
  tags: ['Inventory'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['name', 'unit'],
    properties: {
      name: { type: 'string' },
      unit: { type: 'string' },
      currentStock: { type: 'number', minimum: 0, default: 0 },
      lowStockThreshold: { type: 'number', minimum: 0 },
      supplierName: { type: 'string' },
      lastPurchaseDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
  },
  response: {
    201: {
      description: 'Inventory item created',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' }, displayId: { type: 'string' } },
        },
      },
    },
  },
};

export const GetInventoryItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  lowStockOnly: z.coerce.boolean().default(false),
});

export type GetInventoryItemsQuery = z.infer<typeof GetInventoryItemsQuerySchema>;

export const getInventoryItemsJsonSchema = {
  description: 'Retrieve inventory items, optionally filtered to items at or below their low-stock threshold',
  tags: ['Inventory'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 20 },
      search: { type: 'string' },
      lowStockOnly: { type: ['boolean', 'string'], default: false },
    },
  },
  response: {
    200: {
      description: 'Inventory items retrieved successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  displayId: { type: 'string' },
                  name: { type: 'string' },
                  unit: { type: 'string' },
                  currentStock: { type: 'number' },
                  lowStockThreshold: { type: 'number', nullable: true },
                  isLowStock: { type: 'boolean' },
                  supplierName: { type: 'string', nullable: true },
                  lastPurchaseDate: { type: 'string', nullable: true },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalItems: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrevious: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

export const UpdateInventoryItemParamsSchema = z.object({
  itemId: z.string().min(1),
});

export const UpdateInventoryItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  currentStock: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).nullable().optional(),
  supplierName: z.string().nullable().optional(),
  lastPurchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').nullable().optional(),
});

export type UpdateInventoryItemParams = z.infer<typeof UpdateInventoryItemParamsSchema>;
export type UpdateInventoryItemBody = z.infer<typeof UpdateInventoryItemBodySchema>;

export const updateInventoryItemJsonSchema = {
  description: 'Update an inventory item (e.g. restock, adjust threshold)',
  tags: ['Inventory'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['itemId'],
    properties: { itemId: { type: 'string' } },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      unit: { type: 'string' },
      currentStock: { type: 'number', minimum: 0 },
      lowStockThreshold: { type: ['number', 'null'], minimum: 0 },
      supplierName: { type: ['string', 'null'] },
      lastPurchaseDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
  },
  response: {
    200: {
      description: 'Inventory item updated',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            displayId: { type: 'string' },
            name: { type: 'string' },
            unit: { type: 'string' },
            currentStock: { type: 'number' },
            lowStockThreshold: { type: 'number', nullable: true },
            supplierName: { type: 'string', nullable: true },
            lastPurchaseDate: { type: 'string', nullable: true },
          },
        },
      },
    },
    404: {
      description: 'Inventory item not found',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};

export const DeleteInventoryItemParamsSchema = z.object({
  itemId: z.string().min(1),
});

export type DeleteInventoryItemParams = z.infer<typeof DeleteInventoryItemParamsSchema>;

export const deleteInventoryItemJsonSchema = {
  description: 'Delete an inventory item',
  tags: ['Inventory'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['itemId'],
    properties: { itemId: { type: 'string' } },
  },
  response: {
    200: {
      description: 'Inventory item deleted',
      type: 'object',
      properties: { success: { type: 'boolean', default: true } },
    },
    404: {
      description: 'Inventory item not found',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};
