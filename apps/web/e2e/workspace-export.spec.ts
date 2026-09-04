import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';

/**
 * Workspace ZIP export (§30B.4, §31, Sprint 24) — client-side, `fflate`
 * (ADR-25). Triggers the real export button and asserts the downloaded
 * archive's structure, since export packaging happens entirely in the
 * browser (no backend endpoint to hit directly for this one).
 */
test('exports the workspace as a zip containing memoire.json and page markdown', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New page' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editor = page.locator('.ProseMirror');
  await editor.click();
  await editor.pressSequentially('Export fixture content');
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export workspace' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^memoire-export-\d{4}-\d{2}-\d{2}\.zip$/);

  const path = await download.path();
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(path!);
  const entries = unzipSync(buffer);

  expect(entries['memoire.json']).toBeDefined();
  const pageFiles = Object.keys(entries).filter((name) => name.startsWith('pages/') && name.endsWith('.md'));
  expect(pageFiles.length).toBeGreaterThan(0);
});
