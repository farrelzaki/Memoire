import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/db/schema';
import { blocks, pages, pageVersions } from '../src/db/schema';
import { BlocksService } from '../src/blocks/blocks.service';
import type { PagesService } from '../src/pages/pages.service';
import { PageLinksService } from '../src/page-links/page-links.service';
import { StorageService } from '../src/storage/storage.service';
import { VersionsService } from '../src/versions/versions.service';
import { WorkspacesService } from '../src/workspaces/workspaces.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for `VersionsService.restore` (§33A.6,
 * Sprint 25) — never destructive: snapshots current state as `pre_restore`,
 * then writes the OLD content as a brand-new version (never rewinds or
 * deletes history). Same instantiation shim as `test/versions.e2e-spec.ts` —
 * see that file's header comment for why.
 */
describe('VersionsService.restore — never destructive (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const fakeConfig = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const storage = new StorageService(fakeConfig);
  const workspacesService = new WorkspacesService(db as never);
  const pageLinksService = new PageLinksService(db as never);

  const pagesServiceStub = {
    findOne: async (id: string) => {
      const [page] = await db.select().from(pages).where(eq(pages.id, id));
      return page;
    },
  } as unknown as PagesService;

  const ref: { blocksService?: BlocksService } = {};
  const versionsService = new VersionsService(db as never, storage, workspacesService, {
    replace: (...args: Parameters<BlocksService['replace']>) => ref.blocksService!.replace(...args),
  } as unknown as BlocksService);
  const blocksService = new BlocksService(db as never, pagesServiceStub, pageLinksService, versionsService);
  ref.blocksService = blocksService;

  afterAll(async () => {
    await pool.end();
  });

  it('restores old content, snapshots current state first, and never rewinds history', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Restore test', type: 'document' }).returning();
    const blockId = randomUUID();

    await blocksService.replace(page.id, [{ id: blockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'original' }] } }]);
    const [oldVersion] = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    // Backdate past the 10-minute auto-snapshot throttle so the next write
    // actually creates a second version instead of being skipped.
    await db.update(pageVersions).set({ createdAt: new Date(Date.now() - 15 * 60 * 1000) }).where(eq(pageVersions.id, oldVersion.id));

    await blocksService.replace(page.id, [{ id: blockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'changed' }] } }]);
    const beforeRestore = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(beforeRestore).toHaveLength(2);

    await versionsService.restore(oldVersion.id);

    const currentBlocks = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    expect((currentBlocks[0].content as { content: Array<{ text: string }> }).content[0].text).toBe('original');

    const afterRestore = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    // Never rewound — version count only grows: the 2 originals, plus a
    // pre_restore snapshot of the "changed" state, plus a new auto version
    // for the restored-to "original" content.
    expect(afterRestore.length).toBeGreaterThan(beforeRestore.length);
    expect(afterRestore.some((v) => v.kind === 'pre_restore')).toBe(true);
    expect(afterRestore.find((v) => v.id === oldVersion.id)).toBeDefined(); // original version untouched

    await deletePageTree(db, page.id);
  });

  it('restores title/icon alongside blocks', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Original title', icon: '📄', type: 'document' }).returning();
    await blocksService.replace(page.id, [{ id: randomUUID(), type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] } }]);
    const [version] = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(version.title).toBe('Original title');
    expect(version.icon).toBe('📄');

    // Change title/icon directly (mirrors what PagesService.update would do),
    // then confirm restore brings the old ones back.
    await db.update(pages).set({ title: 'Renamed', icon: '🔥' }).where(eq(pages.id, page.id));

    const restored = await versionsService.restore(version.id);
    expect(restored.title).toBe('Original title');
    expect(restored.icon).toBe('📄');

    await deletePageTree(db, page.id);
  });
});
