import { defineConfig, devices } from '@playwright/test';

const port = (() => {
  const raw = process.env.PORT || process.env.VITE_PORT || '5178';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5178;
})();

const e2eSupabaseUrl = process.env.E2E_SUPABASE_URL || 'https://e2e.supabase.local';
const e2eSupabaseAnonKey =
  process.env.E2E_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.signature';
const e2eOauthProviders = process.env.E2E_CLOUD_OAUTH_PROVIDERS || 'google,github';

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
    command: `VITE_SUPABASE_URL=${e2eSupabaseUrl} VITE_SUPABASE_ANON_KEY=${e2eSupabaseAnonKey} VITE_CLOUD_OAUTH_PROVIDERS=${e2eOauthProviders} npm run dev -- --host 127.0.0.1 --strictPort --port ${port}`,
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
