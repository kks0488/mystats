import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('backup: legacy `entries` format can be restored', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept());

  const entryText = `e2e legacy backup ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await page.locator('textarea').fill(entryText);
  const saveButton = page.getByRole('button', { name: 'Analyze & Save' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Backup' }).click(),
  ]);

  const backupPath = testInfo.outputPath('mystats-backup.json');
  await download.saveAs(backupPath);

  const raw = await fs.readFile(backupPath, 'utf8');
  const backup = JSON.parse(raw) as Record<string, unknown>;

  const legacyBackup: Record<string, unknown> = { ...backup };
  legacyBackup.entries = legacyBackup.journal;
  delete legacyBackup.journal;

  if (legacyBackup.fallback && typeof legacyBackup.fallback === 'object') {
    const fallback = legacyBackup.fallback as Record<string, unknown>;
    fallback.entries = fallback.journal;
    delete fallback.journal;
  }

  const legacyPath = testInfo.outputPath('mystats-legacy-backup.json');
  await fs.writeFile(legacyPath, JSON.stringify(legacyBackup, null, 2), 'utf8');

  const resetButton = page.getByRole('button', { name: 'Reset DB' });
  await resetButton.scrollIntoViewIfNeeded();
  await resetButton.click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const fileInput = page.locator('#import-upload');
  await fileInput.setInputFiles(legacyPath);

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await expect(page.locator('.journal-entry-item', { hasText: entryText })).toBeVisible();
});
