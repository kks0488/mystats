import { defineConfig, devices } from '@playwright/test';

const port = (() => {
  const raw = process.env.PORT || process.env.VITE_PORT || '5178';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5178;
})();

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --strictPort --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

