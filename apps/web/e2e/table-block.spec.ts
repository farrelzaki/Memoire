import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12B.1): table block — insert via slash menu, edit a cell, use
 * the row/column toolbar, and confirm the edit persists through reload.
 */
test('insert a table, edit a cell, add a row, content persists through reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/table');
  await page.getByText('Table', { exact: true }).click();

  const cells = editorEl.locator('table td, table th');
  await expect(cells).toHaveCount(9); // slash command inserts a 3x3

  await cells.first().click();
  await page.keyboard.type('Name');

  await page.getByTitle('Insert row below').click();
  await expect(editorEl.locator('table tr')).toHaveCount(4);

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('table tr')).toHaveCount(4);
  await expect(reloadedEditor.locator('table th').first()).toHaveText('Name');
});
