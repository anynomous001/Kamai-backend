import { MENU_ITEM_UNITS } from '../menu-items/menu-items.schemas.js';

export const getPublicMenuJsonSchema = {
  description:
    'Public, unauthenticated menu page for a baker. No baker_id or menuItemId is ever exposed. Only isAvailable=true items are returned.',
  tags: ['Public Menu'],
  params: {
    type: 'object',
    required: ['bakerSlug'],
    properties: { bakerSlug: { type: 'string' } },
  },
  response: {
    200: {
      description: 'Public menu retrieved',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            businessName: { type: 'string', nullable: true },
            logoUrl: { type: 'string', nullable: true },
            whatsappNumber: { type: 'string', nullable: true },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  category: { type: 'string', nullable: true },
                  price: { type: 'number' },
                  unit: { type: 'string', enum: MENU_ITEM_UNITS },
                  description: { type: 'string', nullable: true },
                  photoUrl: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    404: {
      description: 'No published menu at this link',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};
