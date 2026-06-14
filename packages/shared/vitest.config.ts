import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // env.ts validates these at import time; provide safe test values.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret',
      INGRESS_DOMAIN: '127.0.0.1.nip.io',
      REGISTRY: 'localhost:5001',
    },
    include: ['src/**/*.test.ts'],
  },
});
