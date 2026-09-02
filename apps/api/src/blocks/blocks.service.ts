import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, notInArray, or, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Block, blocks } from '../db/schema';
import { PagesService } from '../pages/pages.service';
import { collectDescendantBlockIds } from './block-tree.lib';
import { BlockPayloadDto } from './blocks.schema';

@Injectable()
export class BlocksService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly pagesService: PagesService,
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
  async replace(pageId: string, nodes: BlockPayloadDto[]): Promise<Block[]> {
    await this.pagesService.findOne(pageId);

    return this.db.transaction(async (tx) => {
      const ids = nodes.map((n) => n.id);

      if (ids.length === 0) {
        await tx.delete(blocks).where(eq(blocks.pageId, pageId));
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

      return tx
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, pageId))
        .orderBy(sql`${blocks.position} asc`);
    });
  }
}
