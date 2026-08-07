import 'dotenv/config';
import { beforeAll, afterAll, afterEach } from 'vitest';

// ── Global Test Setup ──────────────────────────────────────────
// Env vars that need to be visible to modules reading process.env at
// import time (e.g. config/env.ts's module-level parseEnv() call) belong
// in vitest.config.ts's `test.env`, NOT in vi.stubEnv() calls here: this
// file's own imports below (e.g. `prisma.js`, which transitively imports
// config/env.ts) are hoisted and evaluate before any of this file's
// top-level statements do, so a vi.stubEnv() here would always be too
// late. JWT/cookie/Redis/CORS values come from the real .env for tests.

import { prisma } from '../shared/database/prisma.js';

beforeAll(async () => {
  // Global setup before all tests
});

afterEach(async () => {
  try {
    await prisma.billingHistory.deleteMany({
      where: { bakerId: 'test-baker-id' },
    });
  } catch (error) {
    // Silently ignore if not initialized
  }
});

afterAll(async () => {
  // Global teardown after all tests
});
