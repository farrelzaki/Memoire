import { expect, test } from '@playwright/test';

/**
 * Block drag reorder (§40, Sprint 15's last item): drag the block handle to
 * move a paragraph past another one, confirm the DOM order changes, then
 * reload and confirm the new order persisted through the debounced
 * `replaceBlocks` autosave.
 *
 * Playwright's `locator.dragTo()` does not reliably trigger native HTML5
 * `dragstart` on headless Chromium for elements outside the drop target
 * (a known Playwright/Chromium limitation, confirmed by hand in this repo —
 * `dragTo` produced zero drag events at all). This dispatches the same
 * `dragstart`/`dragover`/`drop`/`dragend` sequence a real browser would fire,
 * with a real `DataTransfer`, which exercises the exact same
 * `editorProps.handleDOMEvents`/`handleDrop` code path the app uses.
 */
test('drag a block past another block, reload, order persists', async ({ page }) => {
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

  // Select Block A so its handle is the one shown, then drag it below Block C.
  await editorEl.locator('p', { hasText: 'Block A' }).click();
  const handle = page.locator('button[title*="Block menu"]');
  await expect(handle).toBeVisible();

  const paraC = editorEl.locator('p', { hasText: 'Block C' });
  const handleBox = await handle.boundingBox();
  const paraCBox = await paraC.boundingBox();
  if (!handleBox || !paraCBox) throw new Error('could not measure drag elements');

  await page.evaluate(
    ([hb, cb]) => {
      const dt = new DataTransfer();
      const source = document.elementFromPoint(hb.x + hb.width / 2, hb.y + hb.height / 2) as HTMLElement;
      const dropX = cb.x + cb.width / 2;
      const dropY = cb.y + cb.height + 15; // below Block C — "insert after C"
      const target = (document.elementFromPoint(dropX, dropY) as HTMLElement) ?? source;
      const fire = (el: HTMLElement, type: string, x: number, y: number) => {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      };
      fire(source, 'dragstart', hb.x + hb.width / 2, hb.y + hb.height / 2);
      fire(target, 'dragover', dropX, dropY);
      fire(target, 'drop', dropX, dropY);
      fire(source, 'dragend', dropX, dropY);
    },
    [handleBox, paraCBox],
  );

  await expect(editorEl.locator('p')).toHaveText(['Block B', 'Block C', 'Block A']);

  // Autosave debounces at 800ms (§10B.4) — wait for it to actually commit.
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.reload();
  const editorAfterReload = page.locator('.ProseMirror');
  await expect(editorAfterReload.locator('p')).toHaveText(['Block B', 'Block C', 'Block A']);
});
