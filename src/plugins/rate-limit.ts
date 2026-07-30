import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

import { env } from '../config/env.js';

export const rateLimitPlugin = fp(async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) =>
      req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'unknown',
    errorResponseBuilder: (_req, context) => ({
      success: false,
      message: `Too many requests. You have been rate limited. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      errorCode: 'TOO_MANY_REQUESTS',
      details: {
        limit: context.max,
        retryAfter: Math.ceil(context.ttl / 1000),
      },
    }),
  });
});
