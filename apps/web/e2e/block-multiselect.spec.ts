import { expect, test } from '@playwright/test';

/**
 * Multi-block selection + bulk actions (§40, Sprint 15's last item): drag on
 * the selection gutter to the left of the editor content to select a
 * contiguous range of top-level blocks, confirm the bulk toolbar appears,
 * copy the range as Markdown, then delete it and confirm the deletion
 * persists through reload.
 *
 * The gutter is a plain native-mouse drag target entirely outside the
 * ProseMirror content DOM (`data-testid="selection-gutter"` in
 * `document-editor.tsx`) — never dnd-kit and never a ProseMirror decoration
 * plugin (§CLAUDE.md/ADR-11), same rule the drag-reorder handle follows.
 * Unlike native HTML5 drag (`draggable`), a plain mouse drag (`mouse.down` /
 * `mouse.move` / `mouse.up`) works fine with Playwright — it's only the
 * native `dragstart`/`dragover`/`drop` event sequence that doesn't fire
 * reliably here (see `block-drag-reorder.spec.ts`).
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('drag-select a block range on the gutter, copy as markdown, delete, reload persists', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('Block A');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Block B');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Block C');
  await expect(editorEl.locator('p')).toHaveCount(3);

  const gutter = page.locator('[data-testid="selection-gutter"]');
  const gutterBox = await gutter.boundingBox();
  const paraA = await editorEl.locator('p', { hasText: 'Block A' }).boundingBox();
  const paraB = await editorEl.locator('p', { hasText: 'Block B' }).boundingBox();
  if (!gutterBox || !paraA || !paraB) throw new Error('could not measure gutter/paragraph boxes');

  // Drag from Block A down to Block B — Block C stays outside the selection.
  await page.mouse.move(gutterBox.x + gutterBox.width / 2, paraA.y + paraA.height / 2);
  await page.mouse.down();
  await page.mouse.move(gutterBox.x + gutterBox.width / 2, paraB.y + paraB.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText('2 blocks', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // The OS clipboard normalizes line endings to CRLF on Windows.
  expect(clipboard.replace(/\r\n/g, '\n')).toBe('Block A\n\nBlock B');

  // Re-select (the copy click cleared it) and delete.
  await page.mouse.move(gutterBox.x + gutterBox.width / 2, paraA.y + paraA.height / 2);
  await page.mouse.down();
  await page.mouse.move(gutterBox.x + gutterBox.width / 2, paraB.y + paraB.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('2 blocks', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(editorEl.locator('p')).toHaveText(['Block C']);
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await expect(page.locator('.ProseMirror p')).toHaveText(['Block C']);
});
