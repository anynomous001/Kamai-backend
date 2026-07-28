import type { FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import { razorpayWebhookHandler } from './webhooks.controller.js';

export async function webhooksRoutes(app: FastifyInstance) {
  // Register fastify-raw-body scoped to webhooks routes
  await app.register(rawBody, {
    field: 'rawBody', 
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  app.post('/razorpay', {
    config: {
      rawBody: true, // Used by fastify-raw-body if we had global:true, but here we registered it scoped.
    },
    handler: razorpayWebhookHandler,
  });
}
