import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, notInArray, or, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { Block, blocks } from '../db/schema';
import { PageLinksService } from '../page-links/page-links.service';
import { PagesService } from '../pages/pages.service';
import { VersionsService } from '../versions/versions.service';
import { collectDescendantBlockIds } from './block-tree.lib';
import { BlockPayloadDto } from './blocks.schema';

@Injectable()
export class BlocksService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(forwardRef(() => PagesService)) private readonly pagesService: PagesService,
    private readonly pageLinksService: PageLinksService,
    @Inject(forwardRef(() => VersionsService)) private readonly versionsService: VersionsService,
  ) {}

  async getByPage(pageId: string): Promise<Block[]> {
    await this.pagesService.findOne(pageId);
    return this.db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, pageId))
      .orderBy(sql`${blocks.position} asc`);
  }

  /** Find a block by id, whether it's a top-level row or nested inside one (§11E.4). */
  async findById(id: string): Promise<Block> {
    const [block] = await this.db
      .select()
      .from(blocks)
      .where(or(eq(blocks.id, id), sql`${blocks.descendantIds} @> array[${id}]::uuid[]`));
    if (!block) throw new NotFoundException(`Block ${id} not found`);
    return block;
  }

  /**
   * Upsert a page's blocks by id and delete anything missing from the list,
   * in one transaction (§11E.3). This replaces the old delete-all + insert:
   * that regenerated every block's identity on every autosave, which breaks
   * anything that points at a block (backlinks, synced blocks, search
   * anchors, version diffs, reminders).
   *
   * `updated_at` only advances when `content` actually changed, so a pure
   * reorder doesn't create a version snapshot (§33A).
   */
  async replace(pageId: string, nodes: BlockPayloadDto[], externalTx?: DrizzleTx): Promise<Block[]> {
    const page = await this.pagesService.findOne(pageId);

    const run = async (tx: DrizzleTx): Promise<Block[]> => {
      const ids = nodes.map((n) => n.id);

      if (ids.length === 0) {
        await tx.delete(blocks).where(eq(blocks.pageId, pageId));
        await this.pageLinksService.rebuildForPage(tx, pageId, nodes);
        await this.versionsService.autoSnapshotIfDue(tx, pageId, page.title, page.icon, []);
        return [];
      }

      await tx
        .insert(blocks)
        .values(
          nodes.map((node, index) => ({
            id: node.id,
            pageId,
            type: node.type,
            content: node.content ?? null,
            position: index,
            descendantIds: collectDescendantBlockIds(node.content),
          })),
        )
        .onConflictDoUpdate({
          target: blocks.id,
          set: {
            type: sql`excluded.type`,
            content: sql`excluded.content`,
            position: sql`excluded.position`,
            descendantIds: sql`excluded.descendant_ids`,
            updatedAt: sql`case when ${blocks.content} is distinct from excluded.content
                                then now() else ${blocks.updatedAt} end`,
          },
        });

      await tx.delete(blocks).where(and(eq(blocks.pageId, pageId), notInArray(blocks.id, ids)));

      await this.pageLinksService.rebuildForPage(tx, pageId, nodes);

      const result = await tx
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, pageId))
        .orderBy(sql`${blocks.position} asc`);

      await this.versionsService.autoSnapshotIfDue(
        tx,
        pageId,
        page.title,
        page.icon,
        result.map((b) => ({ id: b.id, type: b.type, content: b.content, position: b.position })),
      );
      return result;
    };

    return externalTx ? run(externalTx) : this.db.transaction(run);
  }
}
