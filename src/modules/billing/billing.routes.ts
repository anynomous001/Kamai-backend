import type { FastifyInstance } from 'fastify';

import { getBillingStatusHandler, createSubscriptionHandler } from './billing.controller.js';
import { getBillingStatusJsonSchema, createSubscriptionJsonSchema } from './billing.schemas.js';

/**
 * Billing & Subscription Routes
 * Prefix: /api/billing
 */
export async function billingRoutes(app: FastifyInstance) {
  app.get('/status', {
    schema: getBillingStatusJsonSchema,
    preHandler: [app.authenticate],
    handler: getBillingStatusHandler,
  });

  app.post('/create-subscription', {
    schema: createSubscriptionJsonSchema,
    preHandler: [app.authenticate],
    handler: createSubscriptionHandler,
  });
}
