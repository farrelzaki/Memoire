import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { BlocksService } from '../blocks/blocks.service';
import type { BlockPayloadDto } from '../blocks/blocks.schema';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { blocks, Page, PageVersion, pages, pageVersions, VersionBlockSnapshot } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { canonicalJson } from './canonical-json.lib';
import { BlockDiffEntry, diffBlocks } from './diff.lib';
import { computeVersionsToDelete } from './retention.lib';

const OFFLOAD_THRESHOLD_BYTES = 256 * 1024;
const AUTO_SNAPSHOT_THROTTLE_MS = 10 * 60 * 1000;
const IDLE_SNAPSHOT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * §33A version history — snapshots, diff, restore, retention. Deliberately
 * has no dependency on `PagesService`: it reads/writes the `pages` table
 * directly via raw `tx` queries (same "raw tx op instead of calling the
 * service" precedent Sprint 24's import code established for
 * `DatabasesService`), so the only module cycle is with `BlocksModule`
 * (needed for `restore`'s block-write step) — resolved with `forwardRef` on
 * both sides. See ADR-26.
 */
@Injectable()
export class VersionsService {
  private readonly logger = new Logger(VersionsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
    private readonly workspacesService: WorkspacesService,
    @Inject(forwardRef(() => BlocksService)) private readonly blocksService: BlocksService,
  ) {}

  /**
   * Called from `BlocksService.replace` and `PagesService.update`, inside
   * their own transaction, right before they return (§33A.2). Never throws
   * on its own — a snapshot failure must not abort the actual content save.
   */
  async autoSnapshotIfDue(
    tx: DrizzleTx,
    pageId: string,
    title: string,
    icon: string | null,
    snapshotBlocks: VersionBlockSnapshot[],
  ): Promise<void> {
    try {
      const hash = this.hashContent(title, icon, snapshotBlocks);
      const [last] = await tx
        .select()
        .from(pageVersions)
        .where(eq(pageVersions.pageId, pageId))
        .orderBy(desc(pageVersions.version))
        .limit(1);
      if (last?.contentHash === hash) return; // no-op write (pure reorder etc.)

      const [lastAuto] = await tx
        .select({ createdAt: pageVersions.createdAt })
        .from(pageVersions)
        .where(and(eq(pageVersions.pageId, pageId), eq(pageVersions.kind, 'auto')))
        .orderBy(desc(pageVersions.createdAt))
        .limit(1);
      const idleOver24h = last && Date.now() - last.createdAt.getTime() >= IDLE_SNAPSHOT_THRESHOLD_MS;
      const dueByThrottle = !lastAuto || Date.now() - lastAuto.createdAt.getTime() >= AUTO_SNAPSHOT_THROTTLE_MS;
      if (!dueByThrottle && !idleOver24h) return;

      await this.writeVersion(tx, pageId, 'auto', null, title, icon, snapshotBlocks, hash);
    } catch (error) {
      this.logger.error(`autoSnapshotIfDue failed for page ${pageId}: ${(error as Error).message}`);
    }
  }

  /** Explicit checkpoint — manual save, pre_restore, pre_import. Always
   * writes (no hash-skip): a deliberate checkpoint is never noise. */
  async snapshot(
    tx: DrizzleTx,
    pageId: string,
    kind: 'manual' | 'pre_restore' | 'pre_import',
    label: string | null,
    title: string,
    icon: string | null,
    snapshotBlocks: VersionBlockSnapshot[],
  ): Promise<PageVersion> {
    const hash = this.hashContent(title, icon, snapshotBlocks);
    return this.writeVersion(tx, pageId, kind, label, title, icon, snapshotBlocks, hash);
  }

  /** Manual "save version now" from the frontend — reads current state itself. */
  async saveManual(pageId: string, label: string | null): Promise<PageVersion> {
    return this.db.transaction(async (tx) => {
      const [page] = await tx.select().from(pages).where(eq(pages.id, pageId));
      if (!page) throw new NotFoundException(`Page ${pageId} not found`);
      const currentBlocks = await tx
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, pageId))
        .orderBy(sql`${blocks.position} asc`);
      return this.snapshot(
        tx,
        pageId,
        'manual',
        label,
        page.title,
        page.icon,
        currentBlocks.map((b) => ({ id: b.id, type: b.type, content: b.content, position: b.position })),
      );
    });
  }

  async listForPage(pageId: string): Promise<Omit<PageVersion, 'content'>[]> {
    return this.db
      .select({
        id: pageVersions.id,
        pageId: pageVersions.pageId,
        version: pageVersions.version,
        kind: pageVersions.kind,
        label: pageVersions.label,
        title: pageVersions.title,
        icon: pageVersions.icon,
        storageKey: pageVersions.storageKey,
        contentHash: pageVersions.contentHash,
        sizeBytes: pageVersions.sizeBytes,
        createdAt: pageVersions.createdAt,
      })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, pageId))
      .orderBy(desc(pageVersions.createdAt));
  }

  async findOneOrThrow(id: string): Promise<PageVersion> {
    const [version] = await this.db.select().from(pageVersions).where(eq(pageVersions.id, id));
    if (!version) throw new NotFoundException(`Version ${id} not found`);
    return version;
  }

  async getFullContent(id: string): Promise<{ version: Omit<PageVersion, 'content'>; blocks: VersionBlockSnapshot[] }> {
    const version = await this.findOneOrThrow(id);
    const resolvedBlocks = await this.resolveContent(version);
    return { version: omitContent(version), blocks: resolvedBlocks };
  }

  async diff(fromId: string, toId: string): Promise<{
    from: Omit<PageVersion, 'content'>;
    to: Omit<PageVersion, 'content'>;
    titleChanged: boolean;
    iconChanged: boolean;
    blockDiffs: BlockDiffEntry[];
  }> {
    const [from, to] = await Promise.all([this.findOneOrThrow(fromId), this.findOneOrThrow(toId)]);
    const [fromBlocks, toBlocks] = await Promise.all([this.resolveContent(from), this.resolveContent(to)]);
    return {
      from: omitContent(from),
      to: omitContent(to),
      titleChanged: from.title !== to.title,
      iconChanged: from.icon !== to.icon,
      blockDiffs: diffBlocks(fromBlocks, toBlocks),
    };
  }

  /**
   * §33A.6 — never destructive: snapshot current state as `pre_restore`,
   * then write the OLD content as a brand-new version. Reuses the
   * auto-snapshot hook (via `BlocksService.replace`) for step 2 rather than
   * a bespoke write path — see ADR-26 for why that resulting version ends
   * up `kind='auto'`.
   */
  async restore(versionId: string): Promise<Page> {
    const target = await this.findOneOrThrow(versionId);
    const targetBlocks = await this.resolveContent(target);

    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(pages).where(eq(pages.id, target.pageId));
      if (!current) throw new NotFoundException(`Page ${target.pageId} not found`);
      const currentBlocks = await tx
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, target.pageId))
        .orderBy(sql`${blocks.position} asc`);

      await this.snapshot(
        tx,
        target.pageId,
        'pre_restore',
        null,
        current.title,
        current.icon,
        currentBlocks.map((b) => ({ id: b.id, type: b.type, content: b.content, position: b.position })),
      );

      await tx
        .update(pages)
        .set({ title: target.title, icon: target.icon, updatedAt: sql`now()` })
        .where(eq(pages.id, target.pageId));
      await this.blocksService.replace(
        target.pageId,
        targetBlocks.map((b) => ({ id: b.id, type: b.type, content: b.content as BlockPayloadDto['content'] })),
        tx,
      );
      // autoSnapshotIfDue inside that replace() call sees the hash differs
      // from the pre_restore snapshot just written and creates a new
      // version automatically — that's step 2 of §33A.6.

      const [restored] = await tx.select().from(pages).where(eq(pages.id, target.pageId));
      return restored;
    });
  }

  /** §33A.3 daily retention prune, offset from `BackupService`'s `0 3 * * *`
   * slot so the two jobs don't compete for I/O at the same instant. */
  @Cron('30 3 * * *')
  async pruneVersions(): Promise<void> {
    try {
      const workspace = await this.workspacesService.getOrCreateDefault();
      const retentionDays = (workspace.settings?.versionRetentionDays as number | null | undefined) ?? null;

      const pageIds = await this.db.selectDistinct({ pageId: pageVersions.pageId }).from(pageVersions);
      for (const { pageId } of pageIds) {
        const versions = await this.db
          .select({ id: pageVersions.id, kind: pageVersions.kind, createdAt: pageVersions.createdAt })
          .from(pageVersions)
          .where(eq(pageVersions.pageId, pageId));
        const idsToDelete = computeVersionsToDelete(versions, { now: new Date(), retentionDays });
        if (idsToDelete.length === 0) continue;

        const offloaded = await this.db
          .select({ storageKey: pageVersions.storageKey })
          .from(pageVersions)
          .where(and(inArray(pageVersions.id, idsToDelete), isNotNull(pageVersions.storageKey)));
        for (const v of offloaded) {
          await this.storage.delete(v.storageKey!).catch(() => {});
        }
        await this.db.delete(pageVersions).where(inArray(pageVersions.id, idsToDelete));
      }
    } catch (error) {
      this.logger.error(`pruneVersions failed: ${(error as Error).message}`);
    }
  }

  private async resolveContent(version: PageVersion): Promise<VersionBlockSnapshot[]> {
    if (version.content) return version.content;
    if (!version.storageKey) return [];
    const { stream } = await this.storage.get(version.storageKey);
    const buffer = await streamToBuffer(stream);
    return JSON.parse(buffer.toString('utf8'));
  }

  private hashContent(title: string, icon: string | null, snapshotBlocks: VersionBlockSnapshot[]): string {
    return createHash('sha256').update(canonicalJson({ title, icon, blocks: snapshotBlocks })).digest('hex');
  }

  private async writeVersion(
    tx: DrizzleTx,
    pageId: string,
    kind: string,
    label: string | null,
    title: string,
    icon: string | null,
    snapshotBlocks: VersionBlockSnapshot[],
    hash: string,
  ): Promise<PageVersion> {
    const id = randomUUID();
    const json = canonicalJson(snapshotBlocks);
    const sizeBytes = Buffer.byteLength(json, 'utf8');

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${pageVersions.version}), 0) + 1` })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, pageId));

    let storedContent: VersionBlockSnapshot[] | null = snapshotBlocks;
    let storageKey: string | null = null;
    if (sizeBytes > OFFLOAD_THRESHOLD_BYTES) {
      storageKey = `versions/${pageId}/${id}.json`;
      await this.storage.upload(storageKey, Buffer.from(json, 'utf8'), 'application/json');
      storedContent = null;
    }

    const [row] = await tx
      .insert(pageVersions)
      .values({
        id,
        pageId,
        version: next,
        kind,
        label,
        title,
        icon,
        content: storedContent,
        storageKey,
        contentHash: hash,
        sizeBytes,
      })
      .returning();
    return row;
  }
}

function omitContent(version: PageVersion): Omit<PageVersion, 'content'> {
  return {
    id: version.id,
    pageId: version.pageId,
    version: version.version,
    kind: version.kind,
    label: version.label,
    title: version.title,
    icon: version.icon,
    storageKey: version.storageKey,
    contentHash: version.contentHash,
    sizeBytes: version.sizeBytes,
    createdAt: version.createdAt,
  };
}
