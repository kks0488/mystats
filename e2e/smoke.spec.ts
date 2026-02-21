import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

async function fillJournalEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.getByPlaceholder(/Describe yourself freely/);
  await expect(editor).toBeVisible();
  await editor.fill(text);
}

async function clickAnalyzeAndSave(page: import('@playwright/test').Page) {
  const saveButton = page.getByRole('button', { name: 'Analyze & Save' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
}

test('journal: can save entry and see it in history', async ({ page }) => {
  const entryText = `e2e journal ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

  await fillJournalEditor(page, entryText);
  await clickAnalyzeAndSave(page);

  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.reload();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();
});

test('journal: can overwrite an existing entry (edit mode)', async ({ page }) => {
  const originalText = `e2e edit original ${Date.now()}`;
  const updatedText = `e2e edit updated ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

  await fillJournalEditor(page, originalText);
  await clickAnalyzeAndSave(page);
  await expect(page.locator('.journal-entry-item', { hasText: originalText })).toBeVisible();

  await page.locator('.journal-entry-item', { hasText: originalText }).click();
  await fillJournalEditor(page, updatedText);

  const saveChangesButton = page.getByRole('button', { name: 'Save changes' });
  await expect(saveChangesButton).toBeEnabled();
  await saveChangesButton.click();
  await expect(page.locator('.journal-entry-item', { hasText: updatedText })).toBeVisible();

  await page.reload();
  await expect(page.locator('.journal-entry-item', { hasText: updatedText })).toBeVisible();
});

test('journal: can delete an entry and it stays deleted after reload', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  const entryText = `e2e delete ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

  await fillJournalEditor(page, entryText);
  await clickAnalyzeAndSave(page);
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.locator('.journal-entry-item', { hasText: entryText }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toHaveCount(0);
});

test('backup: export → reset DB → import restores journal entry', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept());

  const entryText = `e2e backup ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await fillJournalEditor(page, entryText);
  await clickAnalyzeAndSave(page);
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Backup' }).click(),
  ]);

  const backupPath = testInfo.outputPath('mystats-backup.json');
  await download.saveAs(backupPath);

  const backupRaw = await fs.readFile(backupPath, 'utf8');
  const backup = JSON.parse(backupRaw) as Record<string, unknown>;
  const meta = (backup.meta || {}) as Record<string, unknown>;
  expect(meta.version).toBe(2);
  expect(typeof meta.exportedAt).toBe('string');
  expect(typeof meta.appVersion).toBe('string');
  expect(typeof meta.dbVersion).toBe('number');
  expect(Array.isArray(backup.journal)).toBe(true);
  expect(Array.isArray(backup.skills)).toBe(true);
  expect(Array.isArray(backup.insights)).toBe(true);

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
