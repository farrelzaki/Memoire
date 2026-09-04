import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { strToU8, zipSync } from 'fflate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/db/schema';
import { blocks, databaseProperties, databases, pages } from '../src/db/schema';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { StorageService } from '../src/storage/storage.service';
import { ImportService } from '../src/import/import.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for Notion export .zip import (§30A.1,
 * Sprint 24B) — same precedent as `test/import.e2e-spec.ts`. Requires
 * `pnpm infra:up`.
 */
describe('Import — Notion export .zip (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const fakeConfig = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const storage = new StorageService(fakeConfig);
  const attachmentsService = new AttachmentsService(db as never, storage);
  const service = new ImportService(db as never, attachmentsService);

  beforeAll(async () => {
    await getRealWorkspaceId(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('imports a folder hierarchy, an embedded CSV database, and resolves an internal link', async () => {
    const targetHash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    // Note: real Notion database exports also drop one .md file per row
    // alongside the folder's .csv (mirroring the same content) — this
    // fixture deliberately keeps the CSV-database folder .md-free to test
    // "CSV beside a folder = a database" in isolation, since deduplicating
    // a folder that has BOTH a same-named-row .md AND a CSV row is a
    // further layer of Notion-format fidelity outside this sprint's
    // "best-effort, not exhaustive" scope (see the module doc comment).
    const zipBuffer = Buffer.from(
      zipSync({
        [`Target Page ${targetHash}.md`]: strToU8('# Target Page\n\nYou found me.'),
        'Source Page.md': strToU8(
          `# Source Page\n\nSee [Target Page](Target%20Page%20${targetHash}.md) for more.`,
        ),
        'Tasks a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2.csv': strToU8('Name,Done\nItem One,true'),
      }),
    );

    const preview = await service.preview(
      { buffer: zipBuffer, originalname: 'notion-export.zip', mimetype: 'application/zip', size: zipBuffer.length },
      'notion-zip',
    );
    const summary = preview.summary as { pageCount: number; databaseCount: number };
    expect(summary.databaseCount).toBe(1);

    const result = await service.confirm(preview.stagingId);
    const topLevel = await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId));
    const titles = topLevel.map((p) => p.title).sort();
    expect(titles).toEqual(['Source Page', 'Target Page', 'Tasks']);

    // The CSV-beside-folder became a database, not a plain page.
    const tasksPage = topLevel.find((p) => p.title === 'Tasks')!;
    expect(tasksPage.type).toBe('database');
    const [database] = await db.select().from(databases).where(eq(databases.ownerPageId, tasksPage.id));
    expect(database).toBeDefined();
    const properties = await db.select().from(databaseProperties).where(eq(databaseProperties.databaseId, database.id));
    expect(properties.map((p) => p.name)).toEqual(['Name', 'Done']);
    const taskChildren = await db.select().from(pages).where(eq(pages.parentPageId, tasksPage.id));
    expect(taskChildren.map((p) => p.title).sort()).toEqual(['Item One'].sort());

    // The internal link in Source Page should now point at Target Page's real id.
    const targetPage = topLevel.find((p) => p.title === 'Target Page')!;
    const sourcePage = topLevel.find((p) => p.title === 'Source Page')!;
    const sourceBlocks = await db.select().from(blocks).where(eq(blocks.pageId, sourcePage.id));
    const paragraphWithLink = sourceBlocks.find((b) => b.type === 'paragraph')!;
    const linkHref = findLinkHref(paragraphWithLink.content);
    expect(linkHref).toBe(`/${targetPage.id}`);

    await deletePageTree(db, result.importParentPageId);
  });

  it('leaves an unresolvable internal-looking link untouched and reports a warning', async () => {
    const zipBuffer = Buffer.from(
      zipSync({
        'Lonely Page.md': strToU8(
          '# Lonely Page\n\nSee [Ghost](Ghost%20ffffffffffffffffffffffffffffffff.md).',
        ),
      }),
    );
    const preview = await service.preview(
      { buffer: zipBuffer, originalname: 'notion-export.zip', mimetype: 'application/zip', size: zipBuffer.length },
      'notion-zip',
    );
    const result = await service.confirm(preview.stagingId);
    expect(result.warnings.some((w) => w.includes('Ghost'))).toBe(true);

    await deletePageTree(db, result.importParentPageId);
  });
});

interface MinimalNode {
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: MinimalNode[];
}

function findLinkHref(node: unknown): string | undefined {
  const n = node as MinimalNode | null;
  if (!n) return undefined;
  const linkMark = n.marks?.find((m) => m.type === 'link');
  if (linkMark) return linkMark.attrs?.href as string | undefined;
  for (const child of n.content ?? []) {
    const found = findLinkHref(child);
    if (found) return found;
  }
  return undefined;
}
