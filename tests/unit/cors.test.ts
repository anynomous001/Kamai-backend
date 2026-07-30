import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import type { corsPlugin as CorsPlugin } from '../../src/plugins/cors.js';

// CORS_ORIGIN is read once at module-load time (src/config/env.ts), so it must
// be stubbed *before* the plugin module is imported. The global test setup
// (src/tests/setup.ts) already stubs it to 'http://localhost:3000'; override
// it here to also include the real production frontend origin, then import
// the plugin fresh via a dynamic import so it picks up the new value.
let corsPlugin: typeof CorsPlugin;

beforeAll(async () => {
  vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000,https://kamai-oms-frontend.vercel.app');
  vi.resetModules();
  ({ corsPlugin } = await import('../../src/plugins/cors.js'));
});

describe('CORS Plugin Tests', () => {
  it('should allow preflight request from the real production frontend origin', async () => {
    const app = Fastify();
    await app.register(corsPlugin);
    app.post('/api/auth/send-email-otp', async () => ({ success: true }));

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/send-email-otp',
      headers: {
        origin: 'https://kamai-oms-frontend.vercel.app',
        'access-control-request-method': 'POST',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://kamai-oms-frontend.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should allow regular POST request with the real production frontend origin header', async () => {
    const app = Fastify();
    await app.register(corsPlugin);
    app.post('/api/auth/send-email-otp', async () => ({ success: true }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      headers: {
        origin: 'https://kamai-oms-frontend.vercel.app',
        'content-type': 'application/json',
      },
      payload: { email: 'test@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://kamai-oms-frontend.vercel.app');
  });

  it('should REJECT preflight request from an arbitrary/attacker-controlled *.vercel.app origin', async () => {
    const app = Fastify();
    await app.register(corsPlugin);
    app.post('/api/auth/send-email-otp', async () => ({ success: true }));

    // Simulates an attacker who deploys their own free Vercel project — a
    // *.vercel.app subdomain is attacker-obtainable, so it must NOT be
    // implicitly trusted just because it shares the vercel.app zone.
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/send-email-otp',
      headers: {
        origin: 'https://attacker-phishing-clone.vercel.app',
        'access-control-request-method': 'POST',
      },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should REJECT a regular POST request from an arbitrary/attacker-controlled *.vercel.app origin', async () => {
    const app = Fastify();
    await app.register(corsPlugin);
    app.post('/api/auth/send-email-otp', async () => ({ success: true }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      headers: {
        origin: 'https://attacker-phishing-clone.vercel.app',
        'content-type': 'application/json',
      },
      payload: { email: 'test@example.com' },
    });

    // fastify-cors omits CORS headers rather than failing the request outright
    // (it's the browser's same-origin policy that ultimately blocks reads),
    // so the property under test is the absence of an allow-origin header —
    // without it, no browser will expose the response to attacker JS.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
