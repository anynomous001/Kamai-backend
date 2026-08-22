import { z } from 'zod';

export const OrderDtoSchema = z.object({
  id: z.string().uuid(),
  bakerId: z.string().uuid(),
  orderNumber: z.string(),
  deliveryDate: z.string().datetime(),
  status: z.enum(['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled']),
  totalPrice: z.number(),
  balanceDue: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UpcomingOrderDtoSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  customerName: z.string(),
  cakeCategory: z.string(),
  deliveryDate: z.string(),
  deliveryTime: z.string().nullable(),
  status: z.enum(['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled']),
  totalPrice: z.number(),
  balanceDue: z.number(),
});

export const DashboardMetricsDtoSchema = z.object({
  totalOrdersThisMonth: z.number().int(),
  confirmedOrdersCount: z.number().int(),
  pendingOrdersCount: z.number().int(),

  expectedRevenueThisMonth: z.number(),
  confirmedRevenue: z.number(),
  deliveredRevenue: z.number(),
  confirmedBalanceDue: z.number(),

  pendingOrderValue: z.number(),

  totalInvestedThisMonth: z.number(),
});

export const DashboardSummaryResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    todayOrders: z.array(OrderDtoSchema),
    upcomingOrders: z.object({
      month: z.string().nullable(),
      orders: z.array(UpcomingOrderDtoSchema),
    }),
    metrics: DashboardMetricsDtoSchema,
  }),
});

// JSON Schema for Swagger documentation
const orderJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    bakerId: { type: 'string', format: 'uuid' },
    orderNumber: { type: 'string' },
    deliveryDate: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'],
    },
    totalPrice: { type: 'number', description: 'Amount in rupees' },
    balanceDue: { type: 'number', description: 'Amount in rupees' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const dashboardMetricsJsonSchema = {
  type: 'object',
  description:
    'Backs the dashboard\'s 4-card metric grid. All figures scoped to the current calendar month by deliveryDate (or purchaseDate for totalInvestedThisMonth), non-cancelled orders only.',
  properties: {
    totalOrdersThisMonth: { type: 'integer', example: 18, description: 'Count of all non-cancelled orders with deliveryDate this month' },
    confirmedOrdersCount: { type: 'integer', example: 12, description: 'Of the above, count with status = Confirmed' },
    pendingOrdersCount: { type: 'integer', example: 6, description: 'Of the above, count with status = Pending' },

    expectedRevenueThisMonth: { type: 'number', example: 84000, description: 'confirmedRevenue + deliveredRevenue' },
    confirmedRevenue: { type: 'number', example: 62000, description: 'Sum of totalPrice for Confirmed orders this month' },
    deliveredRevenue: { type: 'number', example: 22000, description: 'Sum of totalPrice for Delivered orders this month' },
    confirmedBalanceDue: { type: 'number', example: 7580, description: 'Sum of balanceDue for Confirmed orders this month only (not Pending or Delivered)' },

    pendingOrderValue: { type: 'number', example: 22000, description: 'Sum of totalPrice for Pending orders this month' },

    totalInvestedThisMonth: { type: 'number', example: 3575, description: 'Sum of Investment.totalCost (expense ledger) with purchaseDate this month, excluding soft-deleted entries' },
  },
};

const upcomingOrderJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    orderNumber: { type: 'string' },
    customerName: { type: 'string' },
    cakeCategory: { type: 'string' },
    deliveryDate: { type: 'string', description: 'YYYY-MM-DD' },
    deliveryTime: { type: 'string', nullable: true, description: 'HH:MM' },
    status: {
      type: 'string',
      enum: ['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'],
    },
    totalPrice: { type: 'number', description: 'Amount in rupees' },
    balanceDue: { type: 'number', description: 'Amount in rupees' },
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
            todayOrders: {
              type: 'array',
              items: orderJsonSchema,
            },
            upcomingOrders: {
              type: 'object',
              description:
                'Rest of the current month\'s upcoming (non-today, non-cancelled) orders; falls forward to the nearest future month with at least one order if none remain this month. month is null when there is no upcoming order at all.',
              properties: {
                month: { type: 'string', nullable: true, example: '2026-08' },
                orders: {
                  type: 'array',
                  items: upcomingOrderJsonSchema,
                },
              },
            },
            metrics: dashboardMetricsJsonSchema,
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
            monthlyStats: {
              type: 'object',
              description:
                'Aggregated over the same startDate/endDate range as days[] (accurate regardless of order volume, unlike a paginated order list).',
              properties: {
                delivered: { type: 'number', example: 6310, description: 'Sum of totalPrice for Delivered orders in range' },
                estimatedTotal: { type: 'number', example: 13000, description: 'Sum of totalPrice for all non-cancelled orders in range' },
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

// ── GET /api/dashboard/calendar/months ──

export const GetCalendarMonthsOverviewQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format').optional(),
});

export type GetCalendarMonthsOverviewQuery = z.infer<typeof GetCalendarMonthsOverviewQuerySchema>;

export const getCalendarMonthsOverviewJsonSchema = {
  description:
    'Order counts for the 6-month window shown in the calendar month-picker strip (1 month ahead of `month`, then `month`, then 4 months behind).',
  tags: ['Dashboard'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
    },
  },
  response: {
    200: {
      description: 'Successfully retrieved month-overview data',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            months: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string', example: '2026-09' },
                  totalOrders: { type: 'integer', example: 7 },
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
