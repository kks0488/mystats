import { test, expect } from '@playwright/test';

test('journal: can save entry and see it in history', async ({ page }) => {
  const entryText = `e2e journal ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

  await page.locator('textarea').fill(entryText);
  await page.getByRole('button', { name: 'Analyze & Save' }).click();

  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.reload();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();
});

test('backup: export → reset DB → import restores journal entry', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept());

  const entryText = `e2e backup ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await page.locator('textarea').fill(entryText);
  await page.getByRole('button', { name: 'Analyze & Save' }).click();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Backup' }).click(),
  ]);

  const backupPath = testInfo.outputPath('mystats-backup.json');
  await download.saveAs(backupPath);

  const resetButton = page.getByRole('button', { name: 'Reset DB' });
  await resetButton.scrollIntoViewIfNeeded();
  await resetButton.click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const fileInput = page.locator('#import-upload');
  await fileInput.setInputFiles(backupPath);

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();
});

