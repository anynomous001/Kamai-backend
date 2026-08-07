import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Applied to process.env before Vitest imports ANY module (test files,
    // setupFiles, everything) - unlike vi.stubEnv() calls inside
    // setupFiles, which run too late to affect modules like config/env.ts
    // that read process.env at import time via a top-level parseEnv()
    // call. This is what actually makes the DEV_BYPASS_AUTH e2e-test
    // pattern (see src/tests/setup.ts) work.
    env: {
      NODE_ENV: 'test',
      DEV_BYPASS_AUTH: 'true',
      DEV_BAKER_ID: 'test-baker-id',
      DEV_PHONE: '+919999999999',
      DEV_SESSION_ID: 'test-session-id',
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/tests/**',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/index.ts',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@config': path.resolve(__dirname, './src/config'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@middlewares': path.resolve(__dirname, './src/middlewares'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
