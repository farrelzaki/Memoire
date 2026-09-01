import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import { DatabasesService } from '../databases/databases.service';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { blocks, Page, pageCanvases, PageType, pages } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

export type CreatePageInput = {
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
};

@Injectable()
export class PagesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly workspacesService: WorkspacesService,
    private readonly databasesService: DatabasesService,
  ) {}

  async create(data: CreatePageInput): Promise<Page> {
    const workspace = await this.workspacesService.getOrCreateDefault();
    const position = await this.nextPosition(data.parentPageId ?? null);

    const [page] = await this.db
      .insert(pages)
      .values({
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

  /** All pages in the workspace, ordered by position. Caller filters by tree/trash. */
  async findAll(): Promise<Page[]> {
    const workspace = await this.workspacesService.getOrCreateDefault();
    return this.db
      .select()
      .from(pages)
      .where(eq(pages.workspaceId, workspace.id))
      .orderBy(sql`${pages.position} asc`);
  }

  async findOne(id: string): Promise<Page> {
    const [page] = await this.db.select().from(pages).where(eq(pages.id, id));
    if (!page) throw new NotFoundException(`Page ${id} not found`);
    return page;
  }

  async update(id: string, data: UpdatePageInput): Promise<Page> {
    await this.findOne(id);
    const [page] = await this.db
      .update(pages)
      .set({ ...data, updatedAt: sql`now()` })
      .where(eq(pages.id, id))
      .returning();
    return page;
  }

  /** Soft delete → Trash (§32). */
  async archive(id: string): Promise<Page> {
    await this.findOne(id);
    const [page] = await this.db
      .update(pages)
      .set({ isArchived: true, updatedAt: sql`now()` })
      .where(eq(pages.id, id))
      .returning();
    return page;
  }

  async restore(id: string): Promise<Page> {
    await this.findOne(id);
    const [page] = await this.db
      .update(pages)
      .set({ isArchived: false, updatedAt: sql`now()` })
      .where(eq(pages.id, id))
      .returning();
    return page;
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

    const children = await tx
      .select()
      .from(pages)
      .where(eq(pages.parentPageId, source.id))
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
      await this.deletePageTree(tx, id);
    });
    return { id, deleted: true };
  }

  private async deletePageTree(tx: DrizzleTx, id: string): Promise<void> {
    const children = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.parentPageId, id));
    for (const child of children) {
      await this.deletePageTree(tx, child.id);
    }
    await tx.delete(pages).where(eq(pages.id, id));
  }

  async move(
    id: string,
    parentPageId?: string | null,
    position?: number,
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

    const nextPosition = position ?? (await this.nextPosition(newParentId ?? null));
    const [moved] = await this.db
      .update(pages)
      .set({
        parentPageId: newParentId ?? null,
        position: nextPosition,
        updatedAt: sql`now()`,
      })
      .where(eq(pages.id, id))
      .returning();
    return moved;
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
