import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12A.1/§12B.1): KaTeX equations, block and inline. Block via
 * slash menu; inline via the `$x$` input rule (§12A.5).
 *
 * The inline case has one thing worth calling out: `nodeInputRule` (Tiptap's
 * usual input-rule helper) only replaces the *captured group* of the regex
 * match, not the whole match — built for rules like `@mention` where a
 * single trailing character triggers the match. For a `$latex$` rule that
 * needs both delimiters consumed, it left literal `$` characters behind on
 * both sides (confirmed by hand). `equation-node.tsx` uses a plain
 * `InputRule` with `tr.replaceWith(range.from, range.to, node)` instead —
 * this test's assertion on the exact paragraph text is what catches a
 * regression back to that behavior.
 */
test('block equation renders via slash menu and persists through reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/equation');
  await page.getByText('Equation', { exact: true }).click();

  const input = editorEl.locator('input[placeholder*="LaTeX"]');
  await expect(input).toBeVisible();
  await input.fill('E = mc^2');
  await input.press('Enter');

  // KaTeX actually rendered math markup, not just the raw source text.
  await expect(editorEl.locator('.node-equation .katex')).toBeVisible();

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('.node-equation .katex')).toBeVisible();
  await expect(reloadedEditor.locator('.node-equation .katex annotation')).toHaveText('E = mc^2');
});

test('inline equation via $x$ input rule consumes both delimiters', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('The value is $x^2$ done');

  await expect(editorEl.locator('.node-inlineEquation .katex')).toBeVisible();
  // No leftover literal '$' delimiters, and the surrounding text is intact.
  const paragraphText = await editorEl.locator('p').innerText();
  expect(paragraphText).not.toContain('$');
  expect(paragraphText).toContain('The value is');
  expect(paragraphText).toContain('done');

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('.node-inlineEquation .katex')).toBeVisible();
  await expect(reloadedEditor.locator('.node-inlineEquation .katex annotation')).toHaveText('x^2');
});
