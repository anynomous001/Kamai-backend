import type { FastifyInstance } from 'fastify';

import { getPublicMenuHandler } from './public-menu.controller.js';
import { getPublicMenuJsonSchema } from './public-menu.schemas.js';

/**
 * Public Menu Routes (Action 26 — Shareable Menu Link)
 * Prefix: /api/public/menu
 *
 * This is the only unauthenticated route in the app — no `app.authenticate`
 * preHandler, no session/cookie required. Because of that it gets a
 * stricter, dedicated rate limit on top of the global one (registered in
 * src/plugins/rate-limit.ts): global rate limiting is IP-keyed and sized
 * for a logged-in baker's own dashboard traffic, but this route is the one
 * surface anyone on the internet can hit with zero auth, from Instagram
 * bio / WhatsApp status links that get real distribution. 30 req/min/IP is
 * generous for a real customer browsing one baker's menu, while still
 * meaningfully capping slug-enumeration/scraping abuse. Uses the
 * already-installed @fastify/rate-limit (no new dependency) via its
 * documented per-route `config.rateLimit` override.
 */
export async function publicMenuRoutes(app: FastifyInstance) {
  app.get('/:bakerSlug', {
    schema: getPublicMenuJsonSchema,
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: getPublicMenuHandler,
  });
}
