import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import { DatabasesService } from '../databases/databases.service';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Page, PageType, pages } from '../db/schema';
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
  private async nextPosition(parentId: string | null): Promise<number> {
    const rows = await this.db
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
