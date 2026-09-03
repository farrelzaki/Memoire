import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12B.1): code block — Shiki syntax highlighting (via a
 * ProseMirror decoration plugin, not a re-rendered copy of the text — see
 * `code-block-highlight.ts`), language picker, copy button, wrap toggle.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('language picker highlights syntax, copy/wrap work, all persist through reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/code');
  await page.getByText('Code', { exact: true }).click();
  await editorEl.locator('select').selectOption('javascript');
  await page.keyboard.type('const x = 1;');

  // Decorations resolve async (lazy Shiki grammar load) — wait for a colored span.
  await expect(editorEl.locator('pre code span[style*="color"]').first()).toBeVisible({ timeout: 5000 });

  await editorEl.locator('button[title="Copy code"]').click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe('const x = 1;');

  await editorEl.locator('button[title="Toggle line wrap"]').click();
  await expect(editorEl.locator('pre.shiki-host')).toHaveClass(/whitespace-pre-wrap/);

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('select')).toHaveValue('javascript');
  await expect(reloadedEditor.locator('pre code')).toContainText('const x = 1;');
  await expect(reloadedEditor.locator('pre code span[style*="color"]').first()).toBeVisible({ timeout: 5000 });
});
