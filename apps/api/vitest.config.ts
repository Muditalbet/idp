import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // Each test file runs in its own worker → its own synthetic DB instance,
    // so suites never contaminate each other.
    isolate: true,
  },
});
