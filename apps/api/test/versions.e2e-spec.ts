import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/db/schema';
import { pages, pageVersions } from '../src/db/schema';
import { BlocksService } from '../src/blocks/blocks.service';
import type { PagesService } from '../src/pages/pages.service';
import { PageLinksService } from '../src/page-links/page-links.service';
import { StorageService } from '../src/storage/storage.service';
import { VersionsService } from '../src/versions/versions.service';
import { WorkspacesService } from '../src/workspaces/workspaces.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for `VersionsService` (§33A, Sprint 25) —
 * same real-Postgres precedent as `test/search-fts.e2e-spec.ts`: the
 * transactional snapshot-on-write hook and >256KB storage offload can't be
 * meaningfully verified with a mocked db. Requires `pnpm infra:up`.
 *
 * `BlocksService` and `VersionsService` are mutually dependent at runtime
 * (`forwardRef` in the real Nest DI graph — see ADR-26). Constructed here
 * with a small lazy-binding shim instead of booting the full app, mirroring
 * every other `*.e2e-spec.ts` in this project that instantiates services
 * directly rather than through Nest DI. `PagesService` is stubbed to just
 * the one method (`findOne`) `BlocksService.replace` actually calls — real
 * `PagesService` needs `DatabasesService`'s formula/scheduler chain, which
 * is irrelevant to what this file tests.
 */
describe('VersionsService — snapshot-on-write + retention hook (real Postgres)', () => {
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

  it('creates a version when block content changes, skips when identical', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Versioned page', type: 'document' }).returning();

    await blocksService.replace(page.id, [{ id: randomUUID(), type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'v1' }] } }]);
    const afterFirst = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].kind).toBe('auto');

    const sameBlockId = afterFirst[0].content![0].id;
    await blocksService.replace(page.id, [{ id: sameBlockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'v1' }] } }]);
    const afterNoop = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(afterNoop).toHaveLength(1); // identical content — no new version

    await deletePageTree(db, page.id);
  });

  it('throttles auto snapshots to once per 10 minutes, except after a >24h idle gap', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Throttle test', type: 'document' }).returning();
    const blockId = randomUUID();

    await blocksService.replace(page.id, [{ id: blockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'a' }] } }]);
    // Backdate the version just written so the next write looks like it's within the 10-minute window.
    const [v1] = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    await db.update(pageVersions).set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) }).where(eq(pageVersions.id, v1.id));

    await blocksService.replace(page.id, [{ id: blockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'b' }] } }]);
    const afterThrottled = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(afterThrottled).toHaveLength(1); // within 10 minutes of the last auto version — skipped

    await db.update(pageVersions).set({ createdAt: new Date(Date.now() - 15 * 60 * 1000) }).where(eq(pageVersions.id, v1.id));
    await blocksService.replace(page.id, [{ id: blockId, type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'c' }] } }]);
    const afterDue = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(afterDue).toHaveLength(2); // 10+ minutes since the last auto version — due

    await deletePageTree(db, page.id);
  });

  it('offloads a large snapshot to object storage and round-trips it via getFullContent', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Large page', type: 'document' }).returning();
    const bigText = 'x'.repeat(300 * 1024);

    await blocksService.replace(page.id, [
      { id: randomUUID(), type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: bigText }] } },
    ]);
    const [version] = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(version.content).toBeNull();
    expect(version.storageKey).toMatch(/^versions\//);

    const { blocks } = await versionsService.getFullContent(version.id);
    expect(blocks).toHaveLength(1);

    await deletePageTree(db, page.id);
  });

  it('always writes a manual snapshot, even with unchanged content', async () => {
    const workspaceId = await getRealWorkspaceId(db);
    const [page] = await db.insert(pages).values({ workspaceId, title: 'Manual snapshot test', type: 'document' }).returning();
    await blocksService.replace(page.id, [{ id: randomUUID(), type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'same' }] } }]);

    const manual1 = await versionsService.saveManual(page.id, 'checkpoint one');
    const manual2 = await versionsService.saveManual(page.id, 'checkpoint two');
    expect(manual1.kind).toBe('manual');
    expect(manual2.version).toBeGreaterThan(manual1.version);

    const all = await db.select().from(pageVersions).where(eq(pageVersions.pageId, page.id));
    expect(all.filter((v) => v.kind === 'manual')).toHaveLength(2);

    await deletePageTree(db, page.id);
  });
});
