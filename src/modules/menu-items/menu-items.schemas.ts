import { z } from 'zod';

export const MENU_ITEM_UNITS = ['per_kg', 'per_piece', 'per_box', 'per_dozen'] as const;

// ── Shared ──

const MenuItemResponseProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  category: { type: 'string', nullable: true },
  price: { type: 'number' },
  unit: { type: 'string', enum: MENU_ITEM_UNITS },
  description: { type: 'string', nullable: true },
  photoUrl: { type: 'string', nullable: true },
  isAvailable: { type: 'boolean' },
  sortOrder: { type: 'integer' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

// ── POST /api/menu-items ──

export const CreateMenuItemBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1).optional(),
  price: z.number().positive('Price must be greater than zero'),
  unit: z.enum(MENU_ITEM_UNITS, { errorMap: () => ({ message: `Unit must be one of: ${MENU_ITEM_UNITS.join(', ')}` }) }),
  description: z.string().optional(),
  photoPath: z.string().min(1).optional(),
});

export type CreateMenuItemBody = z.infer<typeof CreateMenuItemBodySchema>;

export const createMenuItemJsonSchema = {
  description: 'Create a new menu item for the shareable public menu',
  tags: ['Menu Items'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['name', 'price', 'unit'],
    properties: {
      name: { type: 'string', minLength: 1 },
      category: { type: 'string', minLength: 1 },
      price: { type: 'number', exclusiveMinimum: 0 },
      unit: { type: 'string', enum: MENU_ITEM_UNITS },
      description: { type: 'string' },
      photoPath: { type: 'string', minLength: 1, description: 'Storage path returned by POST /api/uploads/signed-url (category=MENU_ITEM_PHOTO)' },
    },
  },
  response: {
    201: {
      description: 'Menu item created',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: { type: 'object', properties: MenuItemResponseProperties },
      },
    },
    400: {
      description: 'Validation error',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};

// ── GET /api/menu-items ──

export const getMenuItemsJsonSchema = {
  description: 'List all menu items for the logged-in baker (including unavailable ones)',
  tags: ['Menu Items'],
  security: [{ cookieAuth: [] }],
  response: {
    200: {
      description: 'Menu items retrieved',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object', properties: MenuItemResponseProperties } },
          },
        },
      },
    },
  },
};

// ── PUT /api/menu-items/:id ──

export const UpdateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).nullable().optional(),
  price: z.number().positive('Price must be greater than zero').optional(),
  unit: z.enum(MENU_ITEM_UNITS).optional(),
  description: z.string().nullable().optional(),
  photoPath: z.string().min(1).nullable().optional(),
  isAvailable: z.boolean().optional(),
});

export type UpdateMenuItemBody = z.infer<typeof UpdateMenuItemBodySchema>;

export const updateMenuItemJsonSchema = {
  description: 'Update a menu item, including toggling availability',
  tags: ['Menu Items'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      category: { type: 'string', nullable: true, minLength: 1 },
      price: { type: 'number', exclusiveMinimum: 0 },
      unit: { type: 'string', enum: MENU_ITEM_UNITS },
      description: { type: 'string', nullable: true },
      photoPath: { type: 'string', nullable: true, minLength: 1 },
      isAvailable: { type: 'boolean' },
    },
  },
  response: {
    200: {
      description: 'Menu item updated',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: { type: 'object', properties: MenuItemResponseProperties },
      },
    },
    404: {
      description: 'Menu item not found',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};

// ── DELETE /api/menu-items/:id ──

export const deleteMenuItemJsonSchema = {
  description: 'Delete a menu item',
  tags: ['Menu Items'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      description: 'Menu item deleted',
      type: 'object',
      properties: { success: { type: 'boolean', default: true } },
    },
    404: {
      description: 'Menu item not found',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};

// ── PUT /api/menu-items/reorder ──

export const ReorderMenuItemsBodySchema = z.object({
  menuItemIds: z.array(z.string().uuid()).min(1, 'menuItemIds must contain at least one id'),
});

export type ReorderMenuItemsBody = z.infer<typeof ReorderMenuItemsBodySchema>;

export const reorderMenuItemsJsonSchema = {
  description: "Reorder the baker's menu items — accepts the full ordered array of menuItemIds, sortOrder is reassigned to match array position",
  tags: ['Menu Items'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['menuItemIds'],
    properties: {
      menuItemIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
    },
  },
  response: {
    200: {
      description: 'Menu items reordered',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object', properties: MenuItemResponseProperties } },
          },
        },
      },
    },
    400: {
      description: 'menuItemIds does not exactly match the baker\'s current menu items',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};
