import 'dotenv/config';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// ── Global Test Setup ──────────────────────────────────────────
vi.stubEnv('NODE_ENV', 'test');
if (process.env.DATABASE_URL) {
  vi.stubEnv('DATABASE_URL', process.env.DATABASE_URL);
}
if (process.env.DIRECT_URL) {
  vi.stubEnv('DIRECT_URL', process.env.DIRECT_URL);
}

// Development Bypass settings for testing
vi.stubEnv('DEV_BYPASS_AUTH', 'true');
vi.stubEnv('DEV_BAKER_ID', 'test-baker-id');
vi.stubEnv('DEV_PHONE', '+919999999999');
vi.stubEnv('DEV_SESSION_ID', 'test-session-id');

vi.stubEnv('JWT_SECRET', 'test-jwt-secret-min-32-chars-long-!');
vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-min-32-chars-long-!');
vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-min-32-chars-long-!');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379/1');
vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000');

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
