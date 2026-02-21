import { test, expect } from '@playwright/test';

test('settings: AI config persists via localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.locator('#ai-provider-select').click();
  await page.getByRole('option', { name: 'OpenAI' }).click();

  await page.locator('#api-key-input').fill('sk-e2e-dummy');
  await page.getByRole('button', { name: 'Save Key' }).click();

  await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const stored = await page.evaluate(() => ({
    provider: localStorage.getItem('AI_PROVIDER'),
    apiKey: localStorage.getItem('OPENAI_API_KEY'),
    model: localStorage.getItem('OPENAI_MODEL'),
  }));

  expect(stored.provider).toBe('openai');
  expect(stored.apiKey).toBe('sk-e2e-dummy');
  expect(stored.model).toBeTruthy();
});

test('strategy: shows apiKeyRequired when AI is not configured', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const openReq = indexedDB.open('mystats-db', 8);
    await new Promise<IDBDatabase>((resolve, reject) => {
      openReq.onerror = () => reject(openReq.error);
      openReq.onupgradeneeded = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains('skills')) {
          const store = db.createObjectStore('skills', { keyPath: 'id' });
          store.createIndex('by-category', 'category');
        }
      };
      openReq.onsuccess = () => resolve(openReq.result);
    }).then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['skills'], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          const store = tx.objectStore('skills');
          store.put({
            id: crypto.randomUUID(),
            name: 'e2e-skill',
            category: 'strength',
            sourceEntryIds: [],
            createdAt: Date.now(),
          });
        })
    );
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Strategy' }).click();
  await expect(page.getByRole('heading', { name: 'Strategist' })).toBeVisible();

  await page.locator('textarea').first().fill('e2e: test api key missing');
  const generateButton = page.getByRole('button', { name: 'Generate Strategy' });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  await expect(page.getByText('Add an API key in Dashboard to enable AI features.')).toBeVisible();
});

test('settings: cloud card explains when Supabase is not configured', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const notConfigured = page.getByText(/Cloud Sync is not configured\./);
  if ((await notConfigured.count()) > 0) {
    await expect(notConfigured).toBeVisible();
    return;
  }

  await expect(
    page.getByText(/Sign in with Google|Signed in as|Enable Cloud Sync/i)
  ).toBeVisible();
});
