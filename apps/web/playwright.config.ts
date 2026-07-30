import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke config (TODO M1, design doc §9).
 *
 * The dev server is started with THRESHER_PROVIDER=mock so the API route
 * selects MockProvider — e2e never touches Yahoo. Mock symbols:
 *   MOCKLONG    → emits a LONG plan on swing
 *   MOCKCHOP    → refusal (named gate)
 *   MOCKUNKNOWN → 404 unknown symbol
 */
export default defineConfig({
  testDir: 'e2e',
  // First analyze in dev triggers a cold Next compile — keep these generous.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // MockProvider + keyless (auth off, in-memory cache/limits) so e2e is
    // deterministic and matches CI even when a dev's .env.local has real keys.
    // Next does not overwrite env vars already set here, so empty wins.
    env: {
      THRESHER_PROVIDER: 'mock',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
});
