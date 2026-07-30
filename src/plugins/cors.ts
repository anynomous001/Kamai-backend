import fp from 'fastify-plugin';
import cors from '@fastify/cors';

import { env } from '../config/env.js';

export const corsPlugin = fp(async (app) => {
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const origins: (string | RegExp | boolean)[] = allowedOrigins.map((pattern) => {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*');
      return new RegExp(`^${escaped}$`);
    }
    return pattern;
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      const isAllowed = origins.some((pattern) => {
        if (typeof pattern === 'boolean') return pattern;
        if (pattern instanceof RegExp) return pattern.test(origin);
        return pattern === origin;
      });

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400, // 24 hours preflight cache
  });
});

