import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node tests/e2e/mock-pandascore.mjs',
      url: 'http://127.0.0.1:5200/dota2/matches/upcoming',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `NUXT_IGNORE_LOCK=1 PANDASCORE_TOKEN=e2e-secret PANDASCORE_BASE_URL=http://127.0.0.1:5200 OPENDOTA_BASE_URL=http://127.0.0.1:5200/api DOTAFRAME_DATABASE_PATH=test-results/dotaframe-e2e.sqlite npx nuxt dev --host 127.0.0.1 --port ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
