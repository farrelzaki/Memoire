import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import {
  blocks,
  databaseRows,
  databases,
  pages,
} from '../db/schema';

export interface SearchHit {
  type: 'page' | 'block' | 'database' | 'row';
  pageId: string;
  title: string;
}

/**
 * Workspace search (§25). Uses ILIKE across titles and JSONB content — enough
 * for a personal workspace. A GIN/tsvector FTS index is the upgrade path when
 * data grows large.
 */
@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  async search(query: string): Promise<SearchHit[]> {
    const pattern = `%${query}%`;
    const hits = new Map<string, SearchHit>();

    // 1. Pages by title (highest relevance).
    const titlePages = await this.db
      .select()
      .from(pages)
      .where(and(ilike(pages.title, pattern), eq(pages.isArchived, false)))
      .limit(20);
    for (const page of titlePages) {
      hits.set(page.id, { type: 'page', pageId: page.id, title: page.title });
    }

    // 2. Blocks by content.
    const blockRows = await this.db
      .select({ id: pages.id, title: pages.title })
      .from(blocks)
      .innerJoin(pages, eq(blocks.pageId, pages.id))
      .where(
        and(
          sql`${blocks.content}::text ilike ${pattern}`,
          eq(pages.isArchived, false),
        ),
      )
      .limit(20);
    for (const row of blockRows) {
      if (!hits.has(row.id)) {
        hits.set(row.id, { type: 'block', pageId: row.id, title: row.title });
      }
    }

    // 3. Databases by name.
    const dbRows = await this.db
      .select({ pageId: pages.id, title: pages.title })
      .from(databases)
      .innerJoin(pages, eq(databases.ownerPageId, pages.id))
      .where(and(ilike(databases.name, pattern), eq(pages.isArchived, false)))
      .limit(10);
    for (const row of dbRows) {
      if (!hits.has(row.pageId)) {
        hits.set(row.pageId, { type: 'database', pageId: row.pageId, title: row.title });
      }
    }

    // 4. Database rows by value.
    const rowHits = await this.db
      .select({ pageId: pages.id, title: pages.title })
      .from(databaseRows)
      .innerJoin(databases, eq(databaseRows.databaseId, databases.id))
      .innerJoin(pages, eq(databases.ownerPageId, pages.id))
      .where(
        and(
          sql`${databaseRows.values}::text ilike ${pattern}`,
          eq(pages.isArchived, false),
        ),
      )
      .limit(10);
    for (const row of rowHits) {
      if (!hits.has(row.pageId)) {
        hits.set(row.pageId, { type: 'row', pageId: row.pageId, title: row.title });
      }
    }

    return Array.from(hits.values());
  }
}
