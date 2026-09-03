import { expect, test } from '@playwright/test';

/**
 * The core "does the app actually work" flow (§40): create a page, type into
 * it, reload, and confirm the content survived the round trip through
 * autosave → PUT /pages/:id/blocks → Postgres → GET on reload. No login step
 * — this is a single-user app (§56), so there's nothing to authenticate.
 */
test('create a page, type content, reload, content remains', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New page' }).click();

  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);

  const editor = page.locator('.ProseMirror');
  await editor.click();
  await editor.pressSequentially('Hello from Playwright');

  // Autosave debounces at 800ms (§10B.4) — wait for it to actually commit.
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('Hello from Playwright');
});
