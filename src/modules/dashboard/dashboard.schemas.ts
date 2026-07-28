import { z } from 'zod';

export const OrderDtoSchema = z.object({
  id: z.string().uuid(),
  bakerId: z.string().uuid(),
  deliveryDate: z.string().datetime(),
  status: z.enum(['DRAFT', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED']),
  totalPrice: z.number().int(),
  balanceDue: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DashboardSummaryResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    todayDeliveries: z.number().int(),
    activeOrders: z.number().int(),
    outstandingBalance: z.number().int(),
    totalRevenue: z.number().int(),
    todayOrders: z.array(OrderDtoSchema),
  }),
});

// JSON Schema for Swagger documentation
const orderJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    bakerId: { type: 'string', format: 'uuid' },
    deliveryDate: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED'],
    },
    totalPrice: { type: 'integer', description: 'Amount in paise' },
    balanceDue: { type: 'integer', description: 'Amount in paise' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const dashboardSummaryJsonSchema = {
  description: 'Load high-level operational metrics for the authenticated baker',
  tags: ['Dashboard'],
  security: [{ cookieAuth: [] }],
  response: {
    200: {
      description: 'Dashboard metrics loaded successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            todayDeliveries: { type: 'integer', example: 6 },
            activeOrders: { type: 'integer', example: 14 },
            outstandingBalance: { type: 'integer', example: 13250 },
            totalRevenue: { type: 'integer', example: 145800 },
            todayOrders: {
              type: 'array',
              items: orderJsonSchema,
            },
          },
        },
      },
    },
    401: {
      description: 'Unauthorized - invalid or missing session',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string' },
        errorCode: { type: 'string', example: 'TOKEN_INVALID' },
      },
    },
  },
};

// ── GET /api/dashboard/calendar ──

export const GetCalendarQuerySchema = z.object({
  view: z.enum(['month', 'week']).default('month'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
});

export type GetCalendarQuery = z.infer<typeof GetCalendarQuerySchema>;

export const getCalendarJsonSchema = {
  description: 'Retrieve calendar aggregation of orders for the specified month or week',
  tags: ['Dashboard'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['month', 'week'], default: 'month' },
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
  },
  response: {
    200: {
      description: 'Successfully retrieved calendar data',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            view: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  totalOrders: { type: 'integer' },
                  pending: { type: 'integer' },
                  confirmed: { type: 'integer' },
                  inProgress: { type: 'integer' },
                  ready: { type: 'integer' },
                  delivered: { type: 'integer' },
                  outstandingBalance: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    400: {
      description: 'Validation failed for query parameters',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        error: { type: 'string' },
      },
    },
  },
};
