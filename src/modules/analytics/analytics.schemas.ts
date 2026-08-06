import { z } from 'zod';

// ── GET /api/analytics/summary ──

export const GetAnalyticsSummaryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
});

export type GetAnalyticsSummaryQuery = z.infer<typeof GetAnalyticsSummaryQuerySchema>;

export const getAnalyticsSummaryJsonSchema = {
  description:
    'Monthly revenue/expenses/profit/order-count trend and an expense-category breakdown, both scoped to the trailing `months`-sized window (including the current month). Pass months=1 to scope the category breakdown to the current month only.',
  tags: ['Analytics'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      months: { type: ['integer', 'string'], minimum: 1, maximum: 12, default: 6 },
    },
  },
  response: {
    200: {
      description: 'Analytics summary retrieved successfully',
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
                  month: { type: 'string', description: 'YYYY-MM', example: '2026-03' },
                  revenue: { type: 'number', example: 24500 },
                  expenses: { type: 'number', example: 9800 },
                  profit: { type: 'number', example: 14700 },
                  orderCount: { type: 'integer', example: 18 },
                },
              },
            },
            expensesByCategory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string', example: 'ingredients' },
                  amount: { type: 'number', example: 6200 },
                },
              },
            },
          },
        },
      },
    },
    400: {
      description: 'Request validation failed',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};
