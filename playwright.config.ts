import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * Prerequisites:
 *   npx playwright install chromium   (one-time browser download)
 *   npm run dev                       (start Vite dev server on port 4550)
 *
 * Run:
 *   npm run test:e2e                  (headless)
 *   npm run test:e2e:ui               (interactive UI)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4550',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4550',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
