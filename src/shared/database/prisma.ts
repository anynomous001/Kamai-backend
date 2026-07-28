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
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
