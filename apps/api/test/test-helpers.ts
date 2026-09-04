import { eq, inArray } from 'drizzle-orm';
import { databaseRows, pages, workspaces } from '../src/db/schema';
import type { DrizzleDB } from '../src/db/drizzle.provider';

/**
 * The app's one real workspace (§1 — single-user, exactly one workspace,
 * created lazily). Tests must reuse this, never insert a second `workspaces`
 * row: `ImportService.confirm()`/`BackupService` (and every other service)
 * look the workspace up via an unordered `.limit(1)`, which in practice
 * returns the real, oldest row — never a test-inserted one. A test that
 * creates its own throwaway workspace row is therefore testing against a
 * row nothing under test actually writes into.
 */
export async function getRealWorkspaceId(db: DrizzleDB): Promise<string> {
  const [existing] = await db.select().from(workspaces).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(workspaces).values({ name: 'Memoire' }).returning();
  return created.id;
}

/**
 * Recursively deletes a page and everything under it — the cleanup
 * counterpart to `getRealWorkspaceId`. **Why this exists**: since tests
 * operate on the one real workspace, cleanup can't be "delete everything
 * under my fake workspaceId" (that cleans up nothing real, see above) — it
 * has to delete the specific subtree a test created, rooted at whatever
 * page id `confirm()`/an equivalent call actually returned. Confirmed the
 * hard way: 25 leftover "Import / <date>" pages had silently accumulated in
 * the real workspace before this helper existed.
 *
 * Pages don't cascade-delete via FK (soft-delete wins over cascade,
 * ADR-10), but `databases.owner_page_id` and `database_rows.database_id`
 * DO cascade — so deleting a database's owner *page* is enough to also
 * remove its `databases`/`database_rows` rows; no separate
 * `delete from databases` is needed (or safe to run before the pages that
 * reference it via `pages.database_id`, which is NOT cascading).
 *
 * Order: (1) null `database_rows.page_id` for any row-detail pages in the
 * subtree — that FK isn't cascading either, and a row can outlive the page
 * it's briefly unlinked from here; (2) delete pages in reverse BFS order
 * (children always appear after their parent in a BFS listing, so
 * reversing guarantees every child — including row-detail pages that hold
 * a `database_id` reference — is deleted before its parent, and before the
 * owner page whose deletion cascades away the `databases`/`database_rows` rows).
 */
export async function deletePageTree(db: DrizzleDB, rootPageId: string): Promise<void> {
  const ids: string[] = [rootPageId];
  let frontier = [rootPageId];
  while (frontier.length > 0) {
    const children = await db.select({ id: pages.id }).from(pages).where(inArray(pages.parentPageId, frontier));
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }

  await db.update(databaseRows).set({ pageId: null }).where(inArray(databaseRows.pageId, ids));
  for (const id of [...ids].reverse()) {
    await db.delete(pages).where(eq(pages.id, id));
  }
}
