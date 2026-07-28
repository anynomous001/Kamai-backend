import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';

// Plugins
import { corsPlugin } from './plugins/cors.js';
import { helmetPlugin } from './plugins/helmet.js';
import { cookiePlugin } from './plugins/cookie.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authenticatePlugin } from './plugins/authenticate.js';

// Feature Modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { customersRoutes } from './modules/customers/customers.routes.js';
import { investmentsRoutes } from './modules/investments/investments.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes.js';
import { bakerRoutes } from './modules/baker/baker.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { supportRoutes } from './modules/support/support.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Use Fastify's built-in Pino logger (avoids Logger type mismatch)
    logger:
      env.NODE_ENV === 'development'
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }
        : { level: env.LOG_LEVEL },
    trustProxy: true,
    ajv: {
      customOptions: {
        coerceTypes: false,
        allErrors: true,
        keywords: ['example'],
      },
    },
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security Plugins ──────────────────────────────────────
  await app.register(helmetPlugin);
  await app.register(corsPlugin);
  await app.register(cookiePlugin);
  await app.register(rateLimitPlugin);

  // ── Documentation ─────────────────────────────────────────
  await app.register(swaggerPlugin);

  // ── Error Handling ────────────────────────────────────────
  await app.register(errorHandlerPlugin);

  // ── Welcome / Docs Link ────────────────────────────────────
  app.get(
    '/',
    async (_req, reply) => {
      return reply.code(200).send({
        success: true,
        message: '🚀 Kamai Backend API is running. Visit /docs for documentation.',
      });
    },
  );

  app.get(
    '/doc',
    async (_req, reply) => {
      return reply.redirect('/docs');
    },
  );

  app.get(
    '/swagger',
    async (_req, reply) => {
      return reply.redirect('/docs');
    },
  );

  // ── Health Check ──────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  timestamp: { type: 'string' },
                  version: { type: 'string' },
                  environment: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      return reply.code(200).send({
        success: true,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          environment: env.NODE_ENV,
        },
      });
    },
  );

  // ── Feature Routes ────────────────────────────────────────
  await app.register(authenticatePlugin);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(ordersRoutes, { prefix: '/api/orders' });
  await app.register(customersRoutes, { prefix: '/api/customers' });
  await app.register(investmentsRoutes, { prefix: '/api/investments' });
  await app.register(billingRoutes, { prefix: '/api/billing' });
  await app.register(webhooksRoutes, { prefix: '/api/webhooks' });
  await app.register(bakerRoutes, { prefix: '/api/baker' });
  await app.register(uploadsRoutes, { prefix: '/api/uploads' });
  await app.register(notificationsRoutes, { prefix: '/api/notifications' });
  await app.register(supportRoutes, { prefix: '/api/support' });

  return app;
}
