import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { zipSync, strToU8 } from 'fflate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/db/schema';
import { blocks, importStagings, pages, workspaces } from '../src/db/schema';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { StorageService } from '../src/storage/storage.service';
import { ImportService } from '../src/import/import.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for `ImportService` (§30A, Sprint 24) —
 * same precedent as `test/search-fts.e2e-spec.ts`: the two-step
 * preview/confirm flow does real multi-table transactional writes that a
 * mocked `db` can't meaningfully verify. Requires `pnpm infra:up`.
 *
 * Uses the app's one real workspace (`getRealWorkspaceId`), not a
 * test-inserted throwaway row — `confirm()` always resolves "the"
 * workspace via an unordered `.limit(1)`, which in practice is the real,
 * oldest row, never a fresh test insert (see `test-helpers.ts`). Cleanup
 * (`deletePageTree`) deletes each test's own created subtree by the
 * `importParentPageId` `confirm()` actually returned — a workspace-scoped
 * delete would silently clean up nothing, which is exactly how this file
 * used to leak 25+ "Import / <date>" pages into the real workspace before
 * this fix.
 */
describe('Import — Markdown and memoire.json (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const fakeConfig = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const storage = new StorageService(fakeConfig);
  const attachmentsService = new AttachmentsService(db as never, storage);
  const service = new ImportService(db as never, attachmentsService);

  let workspaceId: string;

  beforeAll(async () => {
    workspaceId = await getRealWorkspaceId(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('previews and confirms a single .md file, creating a new Import parent page', async () => {
    const md = '# Hello\n\nSome **bold** text.\n\n- one\n- two';
    const preview = await service.preview(
      { buffer: Buffer.from(md), originalname: 'note.md', mimetype: 'text/markdown', size: md.length },
      'markdown',
    );
    expect(preview.summary.pageCount).toBe(1);
    expect(preview.warnings).toEqual([]);

    const result = await service.confirm(preview.stagingId);
    expect(result.pageCount).toBe(2); // import parent + the one note page
    expect(result.warnings).toEqual([]);

    const importedPages = await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId));
    expect(importedPages).toHaveLength(1);
    expect(importedPages[0].title).toBe('Hello');

    const importedBlocks = await db.select().from(blocks).where(eq(blocks.pageId, importedPages[0].id));
    expect(importedBlocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletList']);

    // staging row is consumed on confirm
    const staging = await db.select().from(importStagings).where(eq(importStagings.id, preview.stagingId));
    expect(staging).toHaveLength(0);

    await deletePageTree(db, result.importParentPageId);
  });

  it('previews and confirms a .zip of .md files, mirroring folder hierarchy into page hierarchy', async () => {
    const zipBuffer = Buffer.from(
      zipSync({
        'Root.md': strToU8('# Root\n\nTop level.'),
        'Folder/Child.md': strToU8('# Child\n\nNested page.'),
      }),
    );
    const preview = await service.preview(
      { buffer: zipBuffer, originalname: 'export.zip', mimetype: 'application/zip', size: zipBuffer.length },
      'markdown',
    );
    expect(preview.summary.pageCount).toBe(3); // Root, Folder, Folder/Child

    const result = await service.confirm(preview.stagingId);
    const topLevel = await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId));
    expect(topLevel.map((p) => p.title).sort()).toEqual(['Folder', 'Root']);

    const folderPage = topLevel.find((p) => p.title === 'Folder')!;
    const children = await db.select().from(pages).where(eq(pages.parentPageId, folderPage.id));
    expect(children.map((p) => p.title)).toEqual(['Child']);

    await deletePageTree(db, result.importParentPageId);
  });

  it('deletes a staging row on cancel without writing any pages', async () => {
    const md = 'plain text';
    const preview = await service.preview(
      { buffer: Buffer.from(md), originalname: 'note.md', mimetype: 'text/markdown', size: md.length },
      'markdown',
    );
    await service.cancel(preview.stagingId);
    const staging = await db.select().from(importStagings).where(eq(importStagings.id, preview.stagingId));
    expect(staging).toHaveLength(0);
  });

  it('round-trips a memoire.json export through import (page/block counts preserved)', async () => {
    const [rootPage] = await db
      .insert(pages)
      .values({ workspaceId, title: 'Round Trip Root', type: 'document', position: 0 })
      .returning();
    await db.insert(blocks).values({
      pageId: rootPage.id,
      type: 'paragraph',
      position: 0,
      content: { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    });

    const exportJson = {
      app: 'memoire' as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: [{ id: workspaceId, name: 'Memoire' }],
      pages: [{ ...rootPage }],
      blocks: (await db.select().from(blocks).where(eq(blocks.pageId, rootPage.id))).map((b) => ({ ...b })),
      databases: [],
      properties: [],
      rows: [],
      attachments: [],
    };

    const jsonBuffer = Buffer.from(JSON.stringify(exportJson));
    const preview = await service.preview(
      { buffer: jsonBuffer, originalname: 'memoire.json', mimetype: 'application/json', size: jsonBuffer.length },
      'memoire-json',
    );
    expect(preview.summary.pageCount).toBe(1);

    const result = await service.confirm(preview.stagingId);
    const reimported = await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId));
    expect(reimported).toHaveLength(1);
    expect(reimported[0].title).toBe('Round Trip Root');

    const reimportedBlocks = await db.select().from(blocks).where(eq(blocks.pageId, reimported[0].id));
    expect(reimportedBlocks).toHaveLength(1);

    await deletePageTree(db, result.importParentPageId);
    await deletePageTree(db, rootPage.id); // the seed page this test created directly
  });

  it('rejects an SSRF-blocked remote image URL rather than fetching it, and does not fail the import', async () => {
    const md = '# Page with a bad image\n\n![evil](http://169.254.169.254/latest/meta-data/)';
    const preview = await service.preview(
      { buffer: Buffer.from(md), originalname: 'note.md', mimetype: 'text/markdown', size: md.length },
      'markdown',
    );
    const result = await service.confirm(preview.stagingId);
    expect(result.warnings.some((w) => w.includes('169.254.169.254'))).toBe(true);

    const importedPages = await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId));
    const importedBlocks = await db.select().from(blocks).where(eq(blocks.pageId, importedPages[0].id));
    const imageBlock = importedBlocks.find((b) => b.type === 'image')!;
    // still points at the original (unfetched) URL — a downgrade, not a crash.
    expect((imageBlock.content as { attrs?: { src?: string } }).attrs?.src).toBe(
      'http://169.254.169.254/latest/meta-data/',
    );

    await deletePageTree(db, result.importParentPageId);
  });
});
