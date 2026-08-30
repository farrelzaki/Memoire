import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Block, blocks } from '../db/schema';
import { PagesService } from '../pages/pages.service';
import { BlockDto } from './blocks.schema';

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

  /**
   * Replace a page's blocks with the given ordered list, in a transaction (§45).
   * The editor autosaves the whole document, so a full replace is simpler and
   * correct at MVP scale; per-block move/duplicate endpoints arrive with
   * drag & drop (Sprint 6).
   */
  async replace(pageId: string, nodes: BlockDto[]): Promise<Block[]> {
    await this.pagesService.findOne(pageId);

    return this.db.transaction(async (tx) => {
      await tx.delete(blocks).where(eq(blocks.pageId, pageId));
      if (nodes.length === 0) return [];

      return tx
        .insert(blocks)
        .values(
          nodes.map((node, index) => ({
            pageId,
            type: node.type,
            content: node.content ?? null,
            position: index,
          })),
        )
        .returning();
    });
  }
}
