import type { FastifyInstance } from 'fastify';
import { loadSummaryDashboard, getCalendar } from './dashboard.controller.js';
import { dashboardSummaryJsonSchema, getCalendarJsonSchema } from './dashboard.schemas.js';

/**
 * Dashboard Routes
 *
 * Registered in app.ts with prefix: /api/dashboard
 *
 * Routes:
 *   GET /api/dashboard/summary  — Load operational metrics
 */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/summary', {
    schema: dashboardSummaryJsonSchema,
    preHandler: [app.authenticate],
    handler: loadSummaryDashboard,
  });
  app.get('/calendar', {
    schema: getCalendarJsonSchema,
    preHandler: [app.authenticate],
    handler: getCalendar,
  });
}
