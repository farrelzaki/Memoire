import { expect, test } from '@playwright/test';

/**
 * Print route (§30B.3, ADR-12, Sprint 24) — a DOM/CSS smoke test, not real
 * print-output verification (Playwright can't assert actual PDF pagination
 * from `window.print()`, which is a native OS dialog). Confirms: the route
 * renders via `toHtml` (no editor chrome), a toggle block is forced open,
 * and the print stylesheet is present.
 */
test('renders a read-only print view with a forced-open toggle and the print stylesheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New page' }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);
  const pageId = page.url().split('/').pop()!;

  const editor = page.locator('.ProseMirror');
  await editor.click();
  await editor.pressSequentially('/toggle');
  await page.getByText('Toggle list', { exact: true }).click();
  await page.keyboard.type('Toggle summary');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Toggle body content');
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  // window.print() opens a native dialog Playwright can't drive — block it
  // so navigation doesn't hang, and just assert the DOM/CSS it produced.
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`/print/${pageId}`);

  // The root layout still wraps this route (App Router can't opt a route out
  // of it) — `.no-print` elements are present in the DOM but hidden under
  // print media via CSS (globals.css), not literally absent on screen.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.no-print').first()).toBeHidden();

  const details = page.locator('details');
  await expect(details).toHaveAttribute('open', '');
  await expect(page.getByText('Toggle body content')).toBeVisible();

  // Next.js bundles the imported `print.css` into a hashed chunk, so its
  // filename isn't reliably present in any `sheet.href` — check for one of
  // its distinctive rules in the actual parsed CSSOM instead. The rules
  // live inside `print.css`'s own `@media print { ... }` block, so this
  // has to recurse into `CSSMediaRule.cssRules`, not just the sheet's
  // top-level rule list.
  const printCssLoaded = await page.evaluate(() => {
    const containsPrintContentRule = (rules: CSSRuleList): boolean =>
      Array.from(rules).some((rule) =>
        rule instanceof CSSMediaRule ? containsPrintContentRule(rule.cssRules) : rule.cssText.includes('.print-content'),
      );
    return Array.from(document.styleSheets).some((sheet) => {
      try {
        return containsPrintContentRule(sheet.cssRules);
      } catch {
        return false;
      }
    });
  });
  expect(printCssLoaded).toBe(true);
});
