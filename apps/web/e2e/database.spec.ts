import { expect, test } from '@playwright/test';

/**
 * Database core loop (§40): create a database page, add a row, filter it
 * down, sort by a column, then reload and confirm the row survived — the
 * same "did the round trip through the API actually persist" shape as the
 * document flow, but for `database_rows` instead of `blocks`.
 */
test('create a database, add a row, filter, sort, reload', async ({ page }) => {
  await page.goto('/');

  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Database' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  await page.getByRole('button', { name: '+ New row' }).click();
  await expect(page.locator('table tbody tr')).toHaveCount(1);

  const titleCell = page.locator('table tbody tr').first().locator('td').first().locator('input');
  await titleCell.fill('First row');
  await titleCell.blur();

  // Filter down to a value that doesn't match, confirming the row disappears.
  await page.locator('select').first().selectOption({ label: 'Title' });
  const filterValueInput = page.getByPlaceholder('Value');
  await filterValueInput.fill('nonexistent');
  await expect(page.locator('table tbody tr', { hasText: 'No rows yet' })).toBeVisible();

  await filterValueInput.fill('');
  await expect(page.locator('table tbody tr')).toHaveCount(1);

  // Sort — clicking the column header toggles asc/desc; just confirm it doesn't error.
  await page.getByRole('button', { name: 'Title' }).click();

  await page.reload();
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(
    page.locator('table tbody tr').first().locator('td').first().locator('input'),
  ).toHaveValue('First row');
});
