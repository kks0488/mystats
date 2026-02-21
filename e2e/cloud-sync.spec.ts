import { test, expect, type Page } from '@playwright/test';

const SUPABASE_URL = 'https://e2e.supabase.local';
const TEST_EMAIL = 'e2e@example.com';
const TEST_PASSWORD = 'e2e-password';
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

async function setupSupabaseMock(page: Page, options: { failSelectCount?: number } = {}) {
  let failSelectCount = Math.max(0, options.failSelectCount ?? 0);

  const accessToken = buildJwt({
    sub: TEST_USER_ID,
    role: 'authenticated',
    email: TEST_EMAIL,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_EMAIL,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'e2e-refresh-token',
          user,
        }),
      });
      return;
    }

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(user),
      });
      return;
    }

    if (url.includes('/auth/v1/logout')) {
      await route.fulfill({
        status: 204,
        body: '',
      });
      return;
    }

    if (url.includes('/rest/v1/mystats_items')) {
      if (method === 'GET' && failSelectCount > 0) {
        failSelectCount -= 1;
        await route.abort('failed');
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  });
}

async function signInWithEmail(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.locator('#cloud-email').fill(TEST_EMAIL);
  await page.locator('#cloud-password').fill(TEST_PASSWORD);

  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
  await expect(signInButton).toBeEnabled();
  await signInButton.click();

  await expect(page.getByText('Signed in as')).toBeVisible();
}

async function enableCloudSync(page: Page) {
  const enableToggle = page.locator('label', { hasText: 'Enable Cloud Sync' }).locator('input[type="checkbox"]');
  await expect(enableToggle).toBeVisible();
  if (!(await enableToggle.isChecked())) {
    await enableToggle.check();
  }
}

test('cloud sync: retries once and recovers from transient network failure', async ({ page }) => {
  await setupSupabaseMock(page, { failSelectCount: 1 });
  await signInWithEmail(page);
  await enableCloudSync(page);

  const syncButton = page.getByRole('button', { name: 'Sync now' });
  await expect(syncButton).toBeEnabled();
  await syncButton.click();

  await expect(page.getByText(/Synced/)).toBeVisible();
  await expect(page.getByText(/Retries:\s*1/)).toBeVisible();
});

test('cloud sync: applies cooldown after repeated network failures', async ({ page }) => {
  await setupSupabaseMock(page, { failSelectCount: 5 });
  await signInWithEmail(page);
  await enableCloudSync(page);

  const syncButton = page.getByRole('button', { name: 'Sync now' });
  await expect(syncButton).toBeEnabled();
  await syncButton.click();

  await expect(page.getByText(/Failure code:\s*network/i)).toBeVisible();
  await expect(page.getByText(/Cooldown until/i)).toBeVisible();

  await syncButton.click();
  await expect(page.getByText(/temporarily paused/i)).toBeVisible();
});
