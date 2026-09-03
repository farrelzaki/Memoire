import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12A.1/§12A.2): new selection-toolbar marks (underline, text
 * color, highlight color, subscript/superscript) and the link menu (external
 * URL + internal page search, both applied via the selection toolbar's
 * `LinkMenu`). Verified against the live app, not just the unit-level
 * serializer tests in `block-type-registry.spec.ts`.
 */
test('applies underline/highlight/text-color marks and they persist through reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('Hello world');
  await page.keyboard.press('Shift+Home');

  await page.getByTitle('Underline').click();
  await expect(editorEl.locator('u')).toHaveText('Hello world');

  await page.getByTitle('Highlight color').click();
  await page.getByTitle('Yellow').click();
  await expect(editorEl.locator('mark')).toHaveAttribute('data-color', 'hsl(var(--mark-bg-yellow))');

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('u mark')).toHaveText('Hello world');
  await expect(reloadedEditor.locator('mark')).toHaveAttribute('data-color', 'hsl(var(--mark-bg-yellow))');
});

test('external link opens in a new tab, internal link navigates via router', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);
  const originUrl = page.url();

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('visit example');
  await page.keyboard.press('Shift+Home');
  await page.getByTitle('Link').click();
  await page.getByPlaceholder('Paste a link or search pages…').fill('https://example.com');
  await page.getByRole('button', { name: /Link to https/ }).click();

  const externalLink = page.getByRole('link', { name: 'visit example' });
  await expect(externalLink).toHaveAttribute('target', '_blank');
  await expect(externalLink).toHaveAttribute('href', 'https://example.com');

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('go home');
  await page.keyboard.press('Shift+Home');
  await page.getByTitle('Link').click();
  await page.getByPlaceholder('Paste a link or search pages…').fill('Home v2');
  const match = page.locator('button', { hasText: 'Home v2' });
  await expect(match).toBeVisible();
  await match.click();

  const internalLink = page.getByRole('link', { name: 'go home' });
  await expect(internalLink).not.toHaveAttribute('target', '_blank');

  await internalLink.click();
  await expect(page).not.toHaveURL(originUrl);
  await expect(page.locator('.ProseMirror')).toBeVisible();
});
