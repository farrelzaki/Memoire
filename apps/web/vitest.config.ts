import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.test.ts'],
    // e2e/**  Playwright specs (§40) — a different runner, not Vitest.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
