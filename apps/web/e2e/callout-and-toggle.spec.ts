import { expect, test } from '@playwright/test';

/**
 * Sprint 16 (§12B.1): callout and toggle block types, inserted via the slash
 * menu. Uses menu-item clicks rather than pressing Enter to select — the
 * slash menu's own `Enter` key handler loses a race against ProseMirror's
 * default Enter-splits-the-paragraph behavior on this app (both listen on
 * `keydown`, and ProseMirror's handler on the contentEditable element fires
 * first during the bubble phase) — a pre-existing issue, not something this
 * spec works around by accident; see `docs/97-progress.md` for the note to
 * fix it properly in a future session.
 */
test('callout: insert, change icon, content persists through reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/callout');
  await page.getByText('Callout', { exact: true }).click();

  const iconBtn = editorEl.locator('button[title="Change icon"]');
  await expect(iconBtn).toHaveText('💡');
  await iconBtn.click();
  await page.getByRole('button', { name: '🔥' }).click();
  await expect(iconBtn).toHaveText('🔥');

  await page.keyboard.type('Careful with this');
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.reload();
  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.locator('button[title="Change icon"]')).toHaveText('🔥');
  await expect(reloadedEditor.getByText('Careful with this')).toBeVisible();
});

test('toggle: starts open, folds/unfolds, fold state survives reload (localStorage, not content)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTitle('New page').click();
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editorEl = page.locator('.ProseMirror');
  await editorEl.click();
  await page.keyboard.type('/toggle');
  await page.getByText('Toggle list', { exact: true }).click();
  await page.keyboard.type('Summary line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hidden detail');

  // New toggles start open — closing (display: none on everything past the
  // summary) must never happen while the user is still typing the content in.
  await expect(page.getByText('Hidden detail')).toBeVisible();

  const collapseBtn = editorEl.locator('button[title="Collapse"]');
  await collapseBtn.click();
  await expect(page.getByText('Hidden detail')).not.toBeVisible();

  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await page.reload();

  // Content persisted server-side even while folded; fold state persisted
  // client-side (localStorage) — both survive reload, from different stores.
  const reloadedEditor = page.locator('.ProseMirror');
  await expect(reloadedEditor.getByText('Summary line')).toBeVisible();
  await expect(reloadedEditor.getByText('Hidden detail')).not.toBeVisible();

  await reloadedEditor.locator('button[title="Expand"]').click();
  await expect(reloadedEditor.getByText('Hidden detail')).toBeVisible();
});
