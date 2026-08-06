import type { FastifyInstance } from 'fastify';

import { getSummary } from './analytics.controller.js';
import { getAnalyticsSummaryJsonSchema } from './analytics.schemas.js';

/**
 * Analytics Routes
 *
 * Registered in app.ts with prefix: /api/analytics
 *
 * Routes:
 *   GET /api/analytics/summary — Monthly revenue/expenses/profit/order-count
 *                                 trend + expense-category breakdown
 */
export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/summary', {
    schema: getAnalyticsSummaryJsonSchema,
    preHandler: [app.authenticate],
    handler: getSummary,
  });
}
