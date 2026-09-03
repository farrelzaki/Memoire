import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { BlockPayloadDto } from '../blocks/blocks.schema';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { blocks, pageLinks, pages } from '../db/schema';
import { collectPageLinks } from './page-links.lib';

export type Backlink = {
  sourcePageId: string;
  sourcePageTitle: string;
  sourceBlockId: string;
  snippet: string | null;
};

@Injectable()
export class PageLinksService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Rebuilds every `page_links` row sourced from `pageId`: delete then
   * re-insert inside the same transaction as the blocks upsert (§15A.2), so a
   * page's backlinks are never stale relative to its own last save.
   */
  async rebuildForPage(tx: DrizzleTx, pageId: string, nodes: BlockPayloadDto[]): Promise<void> {
    await tx.delete(pageLinks).where(eq(pageLinks.sourcePageId, pageId));

    const links = nodes.flatMap((node) =>
      collectPageLinks(node.id, node.type, node.content).map((link) => ({
        sourcePageId: pageId,
        sourceBlockId: link.sourceBlockId,
        targetPageId: link.targetPageId,
      })),
    );

    if (links.length > 0) {
      await tx.insert(pageLinks).values(links);
    }
  }

  /** Pages that link to `pageId`, most recently linked first (§15A.3). */
  async findBacklinks(pageId: string): Promise<Backlink[]> {
    const rows = await this.db
      .select({
        sourcePageId: pageLinks.sourcePageId,
        sourcePageTitle: pages.title,
        sourceBlockId: pageLinks.sourceBlockId,
        createdAt: pageLinks.createdAt,
        content: blocks.content,
      })
      .from(pageLinks)
      .innerJoin(pages, eq(pages.id, pageLinks.sourcePageId))
      .leftJoin(blocks, eq(blocks.id, pageLinks.sourceBlockId))
      .where(eq(pageLinks.targetPageId, pageId))
      .orderBy(desc(pageLinks.createdAt));

    return rows.map((row) => ({
      sourcePageId: row.sourcePageId,
      sourcePageTitle: row.sourcePageTitle,
      sourceBlockId: row.sourceBlockId,
      snippet: extractSnippet(row.content),
    }));
  }
}

/** Best-effort plain-text snippet for the backlink panel — never throws on odd shapes. */
function extractSnippet(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const text: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as { text?: string; content?: unknown[] };
    if (typeof node.text === 'string') text.push(node.text);
    for (const child of node.content ?? []) walk(child);
  };
  walk(content);
  const joined = text.join(' ').trim();
  return joined.length > 0 ? joined.slice(0, 200) : null;
}
