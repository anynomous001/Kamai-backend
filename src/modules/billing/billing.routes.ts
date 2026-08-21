import type { FastifyInstance } from 'fastify';

import {
  getBillingStatusHandler,
  createSubscriptionHandler,
  cancelSubscriptionHandler,
} from './billing.controller.js';
import {
  getBillingStatusJsonSchema,
  createSubscriptionJsonSchema,
  cancelSubscriptionJsonSchema,
} from './billing.schemas.js';

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

  // No requireWriteAccess: a trial-expired/read-only baker must still be
  // able to cancel their subscription. Same reasoning as create-subscription
  // staying ungated - gating either would create a lockout deadlock.
  app.post('/cancel-subscription', {
    schema: cancelSubscriptionJsonSchema,
    preHandler: [app.authenticate],
    handler: cancelSubscriptionHandler,
  });
}
