import { z } from 'zod';

// ── GET /api/customers (Customer Directory) ─────────────

export const GetCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z
    .enum(['name', 'lastOrderDate', 'lifetimeValue', 'totalOrders', 'outstandingBalance'])
    .default('lastOrderDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type GetCustomersQuery = z.infer<typeof GetCustomersQuerySchema>;

export const getCustomersJsonSchema = {
  description: 'Retrieve a paginated and sortable list of customers for the authenticated baker',
  tags: ['Customers'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 20 },
      search: { type: 'string', description: 'Search by name or phone' },
      sort: {
        type: 'string',
        enum: ['name', 'lastOrderDate', 'lifetimeValue', 'totalOrders', 'outstandingBalance'],
        default: 'lastOrderDate',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
    },
  },
  response: {
    200: {
      description: 'Successfully retrieved customers',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            customers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  customerId: { type: 'string' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: ['string', 'null'] },
                  totalOrders: { type: 'integer' },
                  lifetimeValue: { type: 'number' },
                  outstandingBalance: { type: 'number' },
                  lastOrderDate: { type: ['string', 'null'], format: 'date-time' },
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

// ── GET /api/customers/:customerId (Customer Profile) ──

export const GetCustomerProfileParamsSchema = z.object({
  customerId: z.string().min(1),
});

export const GetCustomerProfileQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type GetCustomerProfileParams = z.infer<typeof GetCustomerProfileParamsSchema>;
export type GetCustomerProfileQuery = z.infer<typeof GetCustomerProfileQuerySchema>;

export const getCustomerProfileJsonSchema = {
  description: 'Retrieve a complete customer CRM profile including paginated order history',
  tags: ['Customers'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
    },
    required: ['customerId'],
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 10 },
    },
  },
  response: {
    200: {
      description: 'Successfully retrieved customer profile',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            customerId: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            address: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            preferredDeliveryTime: { type: ['string', 'null'] },
            summary: {
              type: 'object',
              properties: {
                totalOrders: { type: 'integer' },
                lifetimeValue: { type: 'number' },
                outstandingBalance: { type: 'number' },
                lastOrderDate: { type: ['string', 'null'], format: 'date-time' },
              },
            },
            orders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  orderId: { type: 'string' },
                  orderNumber: { type: 'string' },
                  deliveryDate: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                  totalPrice: { type: 'number' },
                  balanceDue: { type: 'number' },
                  paymentStatus: { type: 'string' },
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
    404: {
      description: 'Customer not found or access denied',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        error: { type: 'string' },
      },
    },
  },
};

// ── PUT /api/customers/:customerId (Update Customer) ──

export const UpdateCustomerParamsSchema = z.object({
  customerId: z.string().min(1),
});

export const UpdateCustomerBodySchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  preferredDeliveryTime: z.string().max(50).optional().nullable(),
});

export type UpdateCustomerParams = z.infer<typeof UpdateCustomerParamsSchema>;
export type UpdateCustomerBody = z.infer<typeof UpdateCustomerBodySchema>;

export const updateCustomerJsonSchema = {
  description: 'Update customer contact information and delivery preferences',
  tags: ['Customers'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
    },
    required: ['customerId'],
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 100 },
      phone: { type: 'string', minLength: 10, maxLength: 15 },
      address: { type: ['string', 'null'], maxLength: 500 },
      notes: { type: ['string', 'null'], maxLength: 1000 },
      preferredDeliveryTime: { type: ['string', 'null'], maxLength: 50 },
    },
    required: ['name', 'phone'],
  },
  response: {
    200: {
      description: 'Customer updated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            customerId: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            address: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            preferredDeliveryTime: { type: ['string', 'null'] },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Validation failed',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        error: { type: 'string' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    404: {
      description: 'Customer not found or access denied',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        error: { type: 'string' },
      },
    },
    409: {
      description: 'Customer with this phone already exists',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        error: { type: 'string' },
      },
    },
  },
};
