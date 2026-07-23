// @ts-check
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_URL || 'http://localhost:8080';
const runAllBrowsers = process.env.CI === 'true' || process.env.PLAYWRIGHT_ALL_BROWSERS === 'true';

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  }
];

if (runAllBrowsers) {
  projects.push(
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    }
  );
}

/**
 * OTRUST E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './test/e2e',
  globalSetup: process.env.TEST_URL ? undefined : './test/e2e/global-setup.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects,

  // Local server is started in globalSetup so Windows teardown is deterministic.
  // Set PLAYWRIGHT_ALL_BROWSERS=true to include Firefox and WebKit/mobile.
});
