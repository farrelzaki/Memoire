import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12B.1): columns block — insert (2-5, tested with 3), type in
 * two of them, drag the resize handle, confirm the widths actually traded
 * off between the dragged pair, and confirm content persists through reload.
 *
 * `Column`'s NodeView sets `flex: 0 0 {width}%` on its own rendered div, but
 * `ReactNodeViewRenderer` wraps that in an extra `.node-column` element it
 * creates itself — without `.ProseMirror .node-column { display: contents }`
 * in `globals.css`, that extra element (not the styled one) is the actual
 * flex item and every column silently renders at 0 width. Confirmed by hand
 * while building this — if columns ever collapse to zero width again, look
 * there first before suspecting the resize math.
 */
test('insert 3 columns, resize trades width between the dragged pair, persists through reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/columns');
  await page.getByText('3 columns', { exact: true }).click();

  const cols = editorEl
    .locator('[data-node-view-wrapper]')
    .filter({ has: page.locator('div[title="Drag to resize"]') });
  await expect(cols).toHaveCount(3);

  const width = async (i: number) => (await cols.nth(i).boundingBox())?.width ?? 0;
  const w0Before = await width(0);
  const w1Before = await width(1);
  const w2Before = await width(2);
  expect(Math.abs(w0Before - w1Before)).toBeLessThan(2);
  expect(Math.abs(w1Before - w2Before)).toBeLessThan(2);

  await cols.nth(0).click();
  await page.keyboard.type('Col A');
  await cols.nth(1).click();
  await page.keyboard.type('Col B');

  const handle = cols.nth(0).locator('div[title="Drag to resize"]');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('could not measure resize handle');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 100, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();

  const w0After = await width(0);
  const w1After = await width(1);
  const w2After = await width(2);
  expect(w0After).toBeGreaterThan(w0Before + 50); // grew — dragged right
  expect(w1After).toBeLessThan(w1Before - 50); // shrank by roughly the same amount
  // The uninvolved third column's own `width` attr never changes — this just
  // confirms it didn't also balloon or collapse from the drag, allowing some
  // slack for `gap-4`'s fixed-pixel gap interacting with percentage flex-basis.
  expect(Math.abs(w2After - w2Before)).toBeLessThan(30);

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.getByText('Col A')).toBeVisible();
  await expect(reloadedEditor.getByText('Col B')).toBeVisible();
});
