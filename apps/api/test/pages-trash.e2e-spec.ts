import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { databaseRows, databases, pages } from '../src/db/schema';
import { PagesService } from '../src/pages/pages.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for the two Trash bugs fixed in Sprint 25
 * (§32): archive/restore not cascading to a subtree, and a live crash
 * permanently deleting a subtree containing a populated database (FK
 * ordering on `databaseRows.pageId`, which is ON DELETE no action unlike
 * `databases.ownerPageId`/`databaseRows.databaseId`, which cascade).
 * Same real-Postgres precedent as `test/search-fts.e2e-spec.ts` — a mocked
 * db can't meaningfully exercise either bug. Requires `pnpm infra:up`.
 *
 * `PagesService`'s other constructor deps (`WorkspacesService`,
 * `DatabasesService`, `VersionsService`) are never called by
 * archive/restore/permanentDelete, so stubs are safe here — fixtures are
 * seeded directly via raw inserts instead of going through those services.
 */
describe('Pages Trash — cascade archive/restore + FK-safe permanent delete (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const service = new PagesService(db as never, {} as never, {} as never, {} as never);

  afterAll(async () => {
    await pool.end();
  });

  it('archive cascades isArchived=true to every descendant, restore cascades it back', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [root] = await db.insert(pages).values({ workspaceId, title: 'Trash cascade root', type: 'document' }).returning();
    const [child] = await db.insert(pages).values({ workspaceId, parentPageId: root.id, title: 'Child', type: 'document' }).returning();
    const [grandchild] = await db.insert(pages).values({ workspaceId, parentPageId: child.id, title: 'Grandchild', type: 'document' }).returning();

    await service.archive(root.id);
    const archived = await db.select({ id: pages.id, isArchived: pages.isArchived }).from(pages)
      .where(eq(pages.parentPageId, root.id));
    expect(archived.every((p) => p.isArchived)).toBe(true);
    const [gc1] = await db.select({ isArchived: pages.isArchived }).from(pages).where(eq(pages.id, grandchild.id));
    expect(gc1.isArchived).toBe(true);

    await service.restore(root.id);
    const [c2] = await db.select({ isArchived: pages.isArchived }).from(pages).where(eq(pages.id, child.id));
    const [gc2] = await db.select({ isArchived: pages.isArchived }).from(pages).where(eq(pages.id, grandchild.id));
    expect(c2.isArchived).toBe(false);
    expect(gc2.isArchived).toBe(false);

    await deletePageTree(db, root.id);
  });

  it('permanently deletes a subtree containing a populated database without an FK violation', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [root] = await db.insert(pages).values({ workspaceId, title: 'Trash delete root', type: 'document' }).returning();
    const [dbOwnerPage] = await db.insert(pages)
      .values({ workspaceId, parentPageId: root.id, title: 'Tasks', type: 'database' })
      .returning();
    const [database] = await db.insert(databases)
      .values({ workspaceId, ownerPageId: dbOwnerPage.id, name: 'Tasks' })
      .returning();
    const [rowPage] = await db.insert(pages)
      .values({ workspaceId, parentPageId: dbOwnerPage.id, title: 'Row one', type: 'document', databaseId: database.id })
      .returning();
    await db.insert(databaseRows).values({ databaseId: database.id, pageId: rowPage.id, values: {} });

    await service.archive(root.id);
    const result = await service.permanentDelete(root.id);
    expect(result.deleted).toBe(true);

    const remainingPages = await db.select({ id: pages.id }).from(pages)
      .where(eq(pages.id, root.id));
    expect(remainingPages).toHaveLength(0);
    const remainingDatabases = await db.select({ id: databases.id }).from(databases).where(eq(databases.id, database.id));
    expect(remainingDatabases).toHaveLength(0);
    const remainingRows = await db.select({ id: databaseRows.id }).from(databaseRows).where(eq(databaseRows.databaseId, database.id));
    expect(remainingRows).toHaveLength(0);
  });
});
