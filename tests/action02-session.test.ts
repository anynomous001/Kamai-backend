import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Action 2 E2E: Session Validation & Auth Bypass', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('should successfully bypass authentication in test/dev environment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboard/summary',
    });

    // The endpoint should not throw unauthorized since the bypass is enabled globally in setup.ts
    // It might return 200 or 404/NotFoundError if the database record doesn't exist, but NOT a 401.
    expect(response.statusCode).not.toBe(401);
  });
});
