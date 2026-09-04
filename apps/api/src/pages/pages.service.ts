import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { fractionalPosition, renormalizePositions } from '@memoire/validation';
import { DatabasesService } from '../databases/databases.service';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { blocks, databaseProperties, databaseRows, Page, pageCanvases, PageType, pages } from '../db/schema';
import { VersionsService } from '../versions/versions.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

export type CreatePageInput = {
  id?: string;
  title: string;
  parentPageId?: string | null;
  type?: PageType;
  icon?: string | null;
  coverUrl?: string | null;
};

export type UpdatePageInput = {
  title?: string;
  icon?: string | null;
  coverUrl?: string | null;
  isFavorite?: boolean;
  settings?: Record<string, unknown>;
};

@Injectable()
export class PagesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly workspacesService: WorkspacesService,
    private readonly databasesService: DatabasesService,
    @Inject(forwardRef(() => VersionsService)) private readonly versionsService: VersionsService,
  ) {}

  async create(data: CreatePageInput): Promise<Page> {
    const workspace = await this.workspacesService.getOrCreateDefault();
    const position = await this.nextPosition(data.parentPageId ?? null);

    const [page] = await this.db
      .insert(pages)
      .values({
        ...(data.id ? { id: data.id } : {}),
        workspaceId: workspace.id,
        title: data.title ?? 'Untitled',
        type: data.type ?? 'document',
        parentPageId: data.parentPageId ?? null,
        icon: data.icon ?? null,
        coverUrl: data.coverUrl ?? null,
        position,
      })
      .returning();

    // Content-type default content (§11A) — a database page needs its backing
    // databases row + starter properties.
    if (page.type === 'database') {
      await this.databasesService.createDefault(page.id, page.title);
    }

    return page;
  }

  /**
   * All pages in the workspace, ordered by position. Caller filters by
   * tree/trash. Excludes row pages (§20D.3) — this feeds the sidebar,
   * command palette, and `buildPageTree`, and 200 database rows would
   * otherwise flood all three. A row page is still reachable directly by id
   * (`findOne`) or through its row's peek/table cell.
   */
  async findAll(): Promise<Page[]> {
    const workspace = await this.workspacesService.getOrCreateDefault();
    return this.db
      .select()
      .from(pages)
      .where(and(eq(pages.workspaceId, workspace.id), isNull(pages.databaseId)))
      .orderBy(sql`${pages.position} asc`);
  }

  async findOne(id: string): Promise<Page> {
    const [page] = await this.db.select().from(pages).where(eq(pages.id, id));
    if (!page) throw new NotFoundException(`Page ${id} not found`);
    return page;
  }

  /**
   * `data.title` on a row page also patches the row's title-property value
   * (§20D.4), same transaction — the other half of the sync lives in
   * `DatabasesService.updateRow`, which patches `pages.title` back.
   */
  async update(id: string, data: UpdatePageInput): Promise<Page> {
    const existing = await this.findOne(id);

    return this.db.transaction(async (tx) => {
      const [page] = await tx
        .update(pages)
        .set({ ...data, updatedAt: sql`now()` })
        .where(eq(pages.id, id))
        .returning();

      if (data.title !== undefined && existing.databaseId) {
        const [row] = await tx.select().from(databaseRows).where(eq(databaseRows.pageId, id));
        const [titleProperty] = row
          ? await tx
              .select()
              .from(databaseProperties)
              .where(and(eq(databaseProperties.databaseId, existing.databaseId), eq(databaseProperties.type, 'title')))
          : [];
        if (row && titleProperty) {
          await tx
            .update(databaseRows)
            .set({ values: { ...row.values, [titleProperty.id]: data.title }, updatedAt: sql`now()` })
            .where(eq(databaseRows.id, row.id));
        }
      }

      if (data.title !== undefined || data.icon !== undefined) {
        const currentBlocks = await tx
          .select()
          .from(blocks)
          .where(eq(blocks.pageId, id))
          .orderBy(sql`${blocks.position} asc`);
        await this.versionsService.autoSnapshotIfDue(
          tx,
          id,
          page.title,
          page.icon,
          currentBlocks.map((b) => ({ id: b.id, type: b.type, content: b.content, position: b.position })),
        );
      }

      return page;
    });
  }

  /** Soft delete → Trash (§32). Mirrors onto the row, if this is a row page (§20D.5). */
  async archive(id: string): Promise<Page> {
    return this.setArchived(id, true);
  }

  async restore(id: string): Promise<Page> {
    return this.setArchived(id, false);
  }

  private async setArchived(id: string, isArchived: boolean): Promise<Page> {
    return this.db.transaction(async (tx) => {
      const [page] = await tx
        .update(pages)
        .set({ isArchived, updatedAt: sql`now()` })
        .where(eq(pages.id, id))
        .returning();
      await this.cascadeArchive(tx, id, isArchived);
      return page;
    });
  }

  /**
   * Recurses into every child page and mirrors onto each one's databaseRows
   * row if it has one (§20D.5). Archive and restore both cascade
   * unconditionally regardless of a child's current isArchived state —
   * restoring a page also restores every currently-archived descendant,
   * matching Notion's real UX (ADR-26). Without this, a child of an archived
   * page becomes unreachable from the sidebar (parent gone) without ever
   * appearing in Trash either (§32) — a dangling orphan state.
   */
  private async cascadeArchive(tx: DrizzleTx, id: string, isArchived: boolean): Promise<void> {
    const [page] = await tx.select({ databaseId: pages.databaseId }).from(pages).where(eq(pages.id, id));
    if (page?.databaseId) {
      await tx
        .update(databaseRows)
        .set({ isArchived, updatedAt: sql`now()` })
        .where(eq(databaseRows.pageId, id));
    }
    const children = await tx.select({ id: pages.id }).from(pages).where(eq(pages.parentPageId, id));
    for (const child of children) {
      await tx.update(pages).set({ isArchived, updatedAt: sql`now()` }).where(eq(pages.id, child.id));
      await this.cascadeArchive(tx, child.id, isArchived);
    }
  }

  /**
   * Deep-copy a page and everything under it (§7 — one transaction, so a
   * partial copy can never be left behind). Content is copied per content
   * type: blocks for documents, the canvas row for whiteboard/diagram, and the
   * full database for database pages.
   *
   * The copy is placed as the next sibling of the original, mirroring how
   * "Duplicate" behaves in the sidebar.
   */
  async duplicate(id: string): Promise<Page> {
    const source = await this.findOne(id);

    return this.db.transaction(async (tx) => {
      const position = await this.nextPosition(source.parentPageId, tx);
      return this.copyPageTree(tx, source, source.parentPageId, {
        title: `${source.title} (copy)`,
        position,
      });
    });
  }

  /** Recursively copy `source` under `parentPageId`, returning the new page. */
  private async copyPageTree(
    tx: DrizzleTx,
    source: Page,
    parentPageId: string | null,
    overrides?: { title?: string; position?: number },
  ): Promise<Page> {
    const [copy] = await tx
      .insert(pages)
      .values({
        workspaceId: source.workspaceId,
        parentPageId,
        title: overrides?.title ?? source.title,
        icon: source.icon,
        coverUrl: source.coverUrl,
        type: source.type,
        // A duplicate starts out un-favorited; favorites are a manual choice.
        isFavorite: false,
        isArchived: source.isArchived,
        position: overrides?.position ?? source.position,
      })
      .returning();

    const sourceBlocks = await tx
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, source.id))
      .orderBy(sql`${blocks.position} asc`);
    for (const block of sourceBlocks) {
      await tx.insert(blocks).values({
        pageId: copy.id,
        type: block.type,
        position: block.position,
        content: block.content,
        properties: block.properties,
      });
    }

    const [canvas] = await tx
      .select()
      .from(pageCanvases)
      .where(eq(pageCanvases.pageId, source.id));
    if (canvas) {
      await tx.insert(pageCanvases).values({
        pageId: copy.id,
        canvasKind: canvas.canvasKind,
        elements: canvas.elements,
        viewport: canvas.viewport,
      });
    }

    if (source.type === 'database') {
      await this.databasesService.duplicateForPage(source.id, copy.id, tx);
    }

    // Row pages are recreated by `DatabasesService.duplicateForPage` above
    // (one per copied row) — recursing into them here too would double them
    // up, once from that copy loop and once from this tree walk (§20D.3).
    const children = await tx
      .select()
      .from(pages)
      .where(and(eq(pages.parentPageId, source.id), isNull(pages.databaseId)))
      .orderBy(sql`${pages.position} asc`);
    for (const child of children) {
      await this.copyPageTree(tx, child, copy.id);
    }

    return copy;
  }

  /**
   * Hard delete from Trash (§32) — only reachable for an already-archived
   * page, so a single click can never destroy a live page. Blocks, canvases,
   * and databases cascade at the FK level; child pages do not, so the tree is
   * deleted depth-first inside one transaction.
   */
  async permanentDelete(id: string): Promise<{ id: string; deleted: boolean }> {
    const page = await this.findOne(id);
    if (!page.isArchived) {
      throw new BadRequestException(
        'Only archived pages can be permanently deleted — move it to Trash first',
      );
    }

    await this.db.transaction(async (tx) => {
      const ids = await this.collectSubtreeIds(tx, id);
      // databaseRows.pageId -> pages.id is ON DELETE no action (unlike
      // databases.ownerPageId / databaseRows.databaseId, which cascade) — a
      // row-detail page must not be deleted while a database_rows still
      // points at it, or Postgres rejects the DELETE. Null the refs first,
      // then delete deepest-first; deleting the owner page cascades away the
      // databases/database_rows rows on its own, no explicit delete needed.
      await tx.update(databaseRows).set({ pageId: null }).where(inArray(databaseRows.pageId, ids));
      for (const pid of [...ids].reverse()) {
        await tx.delete(pages).where(eq(pages.id, pid));
      }
    });
    return { id, deleted: true };
  }

  /** BFS-collects `rootId` and every descendant id, root first. */
  private async collectSubtreeIds(tx: DrizzleTx, rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await tx.select({ id: pages.id }).from(pages).where(inArray(pages.parentPageId, frontier));
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /**
   * Drag-drop reorder + reparent (§19A.4, Sprint 22) in one transaction —
   * `beforeId`/`afterId` (siblings under the *target* parent) resolve to a
   * fractional position server-side, mirroring `DatabasesService`'s
   * `reorderRow`/`reorderProperty`/`reorderView` (Sprint 21). Omitting both
   * appends at the end, so the non-drag "Move to…" menu path (which doesn't
   * know a specific sibling position) doesn't have to supply anchors.
   */
  async move(
    id: string,
    parentPageId?: string | null,
    beforeId?: string | null,
    afterId?: string | null,
  ): Promise<Page> {
    const page = await this.findOne(id);
    const newParentId = parentPageId === undefined ? page.parentPageId : parentPageId;

    if (newParentId === id) {
      throw new BadRequestException('A page cannot be its own parent');
    }
    if (newParentId) {
      await this.findOne(newParentId); // ensure target exists
      if (await this.hasAncestor(newParentId, id)) {
        throw new BadRequestException('Cannot move a page under its own descendant');
      }
    }

    return this.db.transaction(async (tx) => {
      let position: number;
      if (beforeId === undefined && afterId === undefined) {
        position = await this.nextPosition(newParentId ?? null, tx);
      } else {
        const siblings = await tx
          .select({ id: pages.id, position: pages.position })
          .from(pages)
          .where(newParentId === null ? isNull(pages.parentPageId) : eq(pages.parentPageId, newParentId));
        const resolved = this.reorderPosition(siblings, beforeId ?? null, afterId ?? null);
        if (resolved.renumbered) {
          for (const r of resolved.renumbered) {
            await tx.update(pages).set({ position: r.position }).where(eq(pages.id, r.id));
          }
        }
        position = resolved.position;
      }

      const [moved] = await tx
        .update(pages)
        .set({
          parentPageId: newParentId ?? null,
          position,
          updatedAt: sql`now()`,
        })
        .where(eq(pages.id, id))
        .returning();
      return moved;
    });
  }

  /**
   * Position for an item dropped between `beforeId`/`afterId` (either may be
   * `null` for "at the start"/"at the end", §19A.4). Renormalizes every
   * sibling in `siblings` to integers and retries once if the gap between the
   * two anchors has collapsed. Pure — callers own the actual writes, inside
   * their own transaction. Mirrors `DatabasesService#reorderPosition`
   * (Sprint 21) exactly.
   */
  private reorderPosition(
    siblings: Array<{ id: string; position: number }>,
    beforeId: string | null,
    afterId: string | null,
  ): { position: number; renumbered: Array<{ id: string; position: number }> | null } {
    const before = beforeId ? siblings.find((s) => s.id === beforeId) : undefined;
    const after = afterId ? siblings.find((s) => s.id === afterId) : undefined;
    if (beforeId && !before) throw new NotFoundException(`Reorder anchor ${beforeId} not found`);
    if (afterId && !after) throw new NotFoundException(`Reorder anchor ${afterId} not found`);

    const position = fractionalPosition(before?.position ?? null, after?.position ?? null);
    if (position !== null) return { position, renumbered: null };

    const ordered = [...siblings].sort((a, b) => a.position - b.position);
    const renumbered = renormalizePositions(ordered);
    const byId = new Map(renumbered.map((r) => [r.id, r.position]));
    const retried = fractionalPosition(beforeId ? (byId.get(beforeId) ?? null) : null, afterId ? (byId.get(afterId) ?? null) : null);
    return { position: retried!, renumbered };
  }

  /** Next sibling position for a parent (root when `parentId` is null). */
  private async nextPosition(
    parentId: string | null,
    tx: DrizzleTx | DrizzleDB = this.db,
  ): Promise<number> {
    const rows = await tx
      .select({ max: sql<number>`coalesce(max(${pages.position}), -1)` })
      .from(pages)
      .where(
        parentId === null ? isNull(pages.parentPageId) : eq(pages.parentPageId, parentId),
      );
    return rows[0].max + 1;
  }

  /** True when `ancestorId` is in the parent chain of `pageId` (or equals it). */
  private async hasAncestor(pageId: string, ancestorId: string): Promise<boolean> {
    let cursor: string | null = pageId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === ancestorId) return true;
      if (seen.has(cursor)) return false; // safety against pre-existing cycles
      seen.add(cursor);
      const [p] = await this.db
        .select({ parentPageId: pages.parentPageId })
        .from(pages)
        .where(eq(pages.id, cursor));
      cursor = p?.parentPageId ?? null;
    }
    return false;
  }
}
