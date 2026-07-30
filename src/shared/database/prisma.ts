import { PrismaClient } from '@prisma/client';

import { env } from '../../config/env.js';

// ── Singleton pattern ─────────────────────────────────────────
// Prevents multiple PrismaClient instances in hot-reload (dev)
// and serverless cold starts by attaching to globalThis.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
    // Default 5000ms is too tight for multi-round-trip interactive
    // transactions (order create/update touches customer + order +
    // payment_events + audit log) over the pooled connection's latency.
    transactionOptions: { timeout: 15000 },
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
