import { defineConfig, devices } from '@playwright/test';

/**
 * Sprint 15 (§40): critical-flow e2e. Needs both dev servers **and** the
 * Postgres/MinIO infra up (`pnpm infra:up`, `pnpm db:migrate`, `pnpm dev`) —
 * this config does not start them itself, since the API needs a real
 * database and this repo has no test-database seeding story yet. Point
 * `PLAYWRIGHT_BASE_URL` at a different origin if the web app isn't on the
 * default port.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Full default parallelism (one worker per CPU core) reliably starves the
  // dev server's Fast Refresh compiler on this project's dev machine — specs
  // fail with `net::ERR_ABORTED` / assertion timeouts that have nothing to do
  // with the app, purely from request queueing. 2 has been reliable across
  // repeated runs; override with `--workers=N` if a given machine can take more.
  workers: process.env.CI ? undefined : 2,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
