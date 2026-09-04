import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { blocks, databaseRows, databases, pages, workspaces } from '../src/db/schema';
import { SearchService } from '../src/search/search.service';

/**
 * Real-Postgres integration test for `SearchService` (§25A, Sprint 23).
 * Unlike every other `*.e2e-spec.ts` in this project (which mock `DRIZZLE_DB`
 * entirely — see `test/pages.e2e-spec.ts`), this one connects to the actual
 * local dev Postgres and seeds real rows. The raw `unionAll`/`ts_rank_cd`/
 * `jsonb_path_query_array`/generated-column SQL this service builds has no
 * meaningful coverage from a mocked `db.execute` — a mock only proves *some*
 * SQL string was passed, not that Postgres accepts and correctly evaluates
 * it (confirmed the hard way: two real bugs — an untyped `= any($1)` array
 * cast, and `search_vector`'s `'["string"]'` filter still matching Tiptap's
 * own `type`/`text` discriminator keys — were only caught by running this
 * against the real database, not by any mock). Requires `pnpm infra:up`.
 */
describe('Search full-text search (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const service = new SearchService(db as never);

  const workspaceId = '99999999-0000-0000-0000-000000000001';
  const pageId = '99999999-0000-0000-0000-000000000002';
  const otherPageId = '99999999-0000-0000-0000-000000000003';
  const archivedPageId = '99999999-0000-0000-0000-000000000004';
  const blockId = '99999999-0000-0000-0000-000000000005';
  const databaseId = '99999999-0000-0000-0000-000000000006';
  const rowId = '99999999-0000-0000-0000-000000000007';
  const rowPageId = '99999999-0000-0000-0000-000000000008';

  beforeAll(async () => {
    await db.insert(workspaces).values({ id: workspaceId, name: 'Search FTS test workspace' });

    await db.insert(pages).values([
      { id: pageId, workspaceId, title: 'Quantum Search Fixture', type: 'document' },
      { id: otherPageId, workspaceId, title: 'Unrelated Page', type: 'document' },
      {
        id: archivedPageId,
        workspaceId,
        title: 'Quantum Archived Fixture',
        type: 'document',
        isArchived: true,
      },
      { id: rowPageId, workspaceId, title: 'Row detail page', type: 'document' },
    ]);

    // A paragraph block: its own `type`/`text` discriminator keys must never
    // make it match a search for "paragraph" (the regression this migration fixes).
    await db.insert(blocks).values({
      id: blockId,
      pageId,
      type: 'paragraph',
      content: { type: 'paragraph', content: [{ type: 'text', text: 'quantum entanglement fixture' }] },
    });

    await db.insert(databases).values({
      id: databaseId,
      workspaceId,
      ownerPageId: otherPageId,
      name: 'Quantum Tracker',
    });

    await db.insert(databaseRows).values({
      id: rowId,
      databaseId,
      pageId: rowPageId,
      values: { someProp: 'quantum row fixture value' },
    });
  });

  afterAll(async () => {
    // `databases.id` cascades `database_rows` on delete; `pages.id` cascades
    // `blocks` on delete (§10B) — deleting the database, then the pages,
    // then the workspace is enough, no manual row/block cleanup needed.
    await db.delete(databases).where(eq(databases.id, databaseId));
    await db.delete(pages).where(eq(pages.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await pool.end();
  });

  it('does not match a block on its own "paragraph" type/text discriminator keys', async () => {
    const hits = await service.search({ q: 'paragraph', mode: 'full', sort: 'relevance', limit: 20 });
    expect(hits.find((h) => h.blockId === blockId)).toBeUndefined();
  });

  it('matches a page title, a block, and a database row for a real term, ranked and with snippets', async () => {
    const hits = await service.search({ q: 'quantum', mode: 'full', sort: 'relevance', limit: 20 });

    const pageHit = hits.find((h) => h.type === 'page' && h.pageId === pageId);
    const blockHit = hits.find((h) => h.type === 'block' && h.blockId === blockId);
    const rowHit = hits.find((h) => h.type === 'row' && h.rowId === rowId);
    const dbHit = hits.find((h) => h.type === 'database' && h.databaseId === databaseId);

    expect(pageHit).toBeDefined();
    expect(pageHit?.snippet).toContain('Quantum');
    expect(blockHit).toBeDefined();
    expect(blockHit?.snippet).toContain('quantum');
    expect(rowHit).toBeDefined();
    expect(rowHit?.snippet).toContain('quantum');
    expect(rowHit?.databaseId).toBe(databaseId);
    expect(dbHit).toBeDefined();

    // Page title match (weight 3.0) outranks a block match (weight 1.0) for the same term.
    expect(pageHit!.rank).toBeGreaterThan(blockHit!.rank);
  });

  it('excludes archived pages', async () => {
    const hits = await service.search({ q: 'Quantum', mode: 'full', sort: 'relevance', limit: 20 });
    expect(hits.find((h) => h.pageId === archivedPageId)).toBeUndefined();
  });

  it('narrows by type filter', async () => {
    // Every fixture page is `type: 'document'` — filtering to `whiteboard`
    // (a type none of them have) should exclude all of them, regardless of hit type.
    const hits = await service.search({
      q: 'quantum',
      mode: 'full',
      sort: 'relevance',
      limit: 20,
      type: 'whiteboard',
    });
    expect(hits).toHaveLength(0);
  });

  it('prefix-matches a partial word in quick mode', async () => {
    const hits = await service.search({ q: 'quant', mode: 'quick', sort: 'relevance', limit: 20 });
    expect(hits.find((h) => h.pageId === pageId)).toBeDefined();
  });

  it('resolves a database row to its own detail page, not the database owner page', async () => {
    const hits = await service.search({ q: 'quantum', mode: 'full', sort: 'relevance', limit: 20 });
    const rowHit = hits.find((h) => h.type === 'row' && h.rowId === rowId);
    expect(rowHit?.pageId).toBe(rowPageId);
  });
});
