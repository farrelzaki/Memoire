import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { SearchHit, SearchQuery } from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import {
  buildHeadlineSql,
  buildJsonAllStringsSql,
  buildJsonPlainTextSql,
  buildRankSql,
  buildSubtreePageIdsCte,
  buildTsQuerySql,
  resolveSearchTimeRangeBoundary,
  SEARCH_SOURCE_WEIGHT,
} from './search-query.lib';

interface SearchRow extends Record<string, unknown> {
  type: string;
  page_id: string;
  block_id: string | null;
  row_id: string | null;
  database_id: string | null;
  title: string;
  snippet: string | null;
  rank: number;
  updated_at: string;
}

interface BreadcrumbRow extends Record<string, unknown> {
  leaf_id: string;
  id: string;
  title: string;
  parent_page_id: string | null;
}

/**
 * Ranked full-text search (§25A) over pages, blocks, database rows, and
 * database names — a weighted `UNION ALL` over generated `search_vector`
 * columns (ADR-07), replacing the old ILIKE-on-JSONB-text scan. One
 * hand-composed raw query per search: Drizzle's query builder has no native
 * support for the recursive-CTE + heterogeneous-branch shape this needs, and
 * every predicate here (`@@`, `ts_rank_cd`, `ts_headline`) already has no
 * query-builder helper regardless.
 */
@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const tsQuery = buildTsQuerySql(query.q, query.mode);
    const orderExpr = query.sort === 'updated' ? sql`updated_at desc` : sql`rank desc`;

    const pageFilter = this.commonFilters(query);

    const subtreeCte = query.locationPageId
      ? buildSubtreePageIdsCte(query.locationPageId)
      : sql``;

    const blockPlainText = buildJsonPlainTextSql(sql`b.content`);
    const rowPlainText = buildJsonAllStringsSql(sql`dr.values`);

    const result = await this.db.execute<SearchRow>(sql`
      ${subtreeCte}
      select * from (
        select
          'page' as type,
          p.id as page_id,
          null::uuid as block_id,
          null::uuid as row_id,
          null::uuid as database_id,
          p.title as title,
          ${buildHeadlineSql(sql`p.title`, tsQuery)} as snippet,
          ${buildRankSql(sql`p.search_vector`, tsQuery, SEARCH_SOURCE_WEIGHT.page, sql`p.updated_at`)} as rank,
          p.updated_at as updated_at
        from pages p
        where p.search_vector @@ ${tsQuery}
          ${pageFilter}

        union all

        select
          'block' as type,
          p.id as page_id,
          b.id as block_id,
          null::uuid as row_id,
          null::uuid as database_id,
          p.title as title,
          ${buildHeadlineSql(blockPlainText, tsQuery)} as snippet,
          ${buildRankSql(sql`b.search_vector`, tsQuery, SEARCH_SOURCE_WEIGHT.block, sql`p.updated_at`)} as rank,
          p.updated_at as updated_at
        from blocks b
        inner join pages p on p.id = b.page_id
        where b.search_vector @@ ${tsQuery}
          ${pageFilter}

        union all

        select
          'row' as type,
          coalesce(dr.page_id, d.owner_page_id) as page_id,
          null::uuid as block_id,
          dr.id as row_id,
          dr.database_id as database_id,
          p.title as title,
          ${buildHeadlineSql(rowPlainText, tsQuery)} as snippet,
          ${buildRankSql(sql`dr.search_vector`, tsQuery, SEARCH_SOURCE_WEIGHT.row, sql`dr.updated_at`)} as rank,
          dr.updated_at as updated_at
        from database_rows dr
        inner join databases d on d.id = dr.database_id
        inner join pages p on p.id = coalesce(dr.page_id, d.owner_page_id)
        where dr.search_vector @@ ${tsQuery}
          and dr.is_archived = false
          ${pageFilter}

        union all

        select
          'database' as type,
          d.owner_page_id as page_id,
          null::uuid as block_id,
          null::uuid as row_id,
          d.id as database_id,
          p.title as title,
          ${buildHeadlineSql(sql`d.name`, tsQuery)} as snippet,
          ${buildRankSql(sql`to_tsvector('simple', d.name)`, tsQuery, SEARCH_SOURCE_WEIGHT.database, sql`d.updated_at`)} as rank,
          d.updated_at as updated_at
        from databases d
        inner join pages p on p.id = d.owner_page_id
        where to_tsvector('simple', d.name) @@ ${tsQuery}
          ${pageFilter}
      ) hits
      order by ${orderExpr}
      limit ${query.limit}
    `);

    const rows = result.rows;
    const breadcrumbs = await this.resolveBreadcrumbs(rows.map((r) => r.page_id));

    return rows.map((row) => ({
      type: row.type as SearchHit['type'],
      pageId: row.page_id,
      blockId: row.block_id ?? undefined,
      rowId: row.row_id ?? undefined,
      databaseId: row.database_id ?? undefined,
      title: row.title,
      breadcrumb: breadcrumbs.get(row.page_id) ?? [row.title],
      snippet: row.snippet,
      rank: Number(row.rank),
    }));
  }

  /**
   * Filters shared by every branch: archived exclusion, optional page-type
   * filter, optional time-range floor, optional subtree membership. Every
   * branch aliases its resolved `pages` row as `p`, so one `p.`-prefixed
   * fragment applies unchanged everywhere it's interpolated.
   */
  private commonFilters(query: SearchQuery): SQL {
    const parts: SQL[] = [sql`and p.is_archived = false`];
    if (query.type) {
      parts.push(sql`and p.type = ${query.type}`);
    }
    if (query.timeRange) {
      const boundary = resolveSearchTimeRangeBoundary(query.timeRange);
      parts.push(sql`and p.updated_at >= ${boundary}`);
    }
    if (query.locationPageId) {
      parts.push(sql`and p.id in (select id from subtree)`);
    }
    return sql.join(parts, sql` `);
  }

  /**
   * Root-first ancestor titles for a batch of page ids, one recursive query
   * instead of N — the search result list is small (`limit`-bounded) but
   * every hit needs its own breadcrumb.
   */
  private async resolveBreadcrumbs(pageIds: string[]): Promise<Map<string, string[]>> {
    const uniqueIds = [...new Set(pageIds)];
    if (uniqueIds.length === 0) return new Map();

    // A plain JS array interpolated into a drizzle `sql` template renders as a
    // row constructor `(a, b, c)`, not a Postgres array literal — `ARRAY[...]`
    // built from individually-bound params is what actually casts to `uuid[]`.
    const idsArray = sql`array[${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

    const result = await this.db.execute<BreadcrumbRow>(sql`
      with recursive chain as (
        select id, parent_page_id, title, id as leaf_id
        from pages
        where id = any(${idsArray})
        union all
        select p.id, p.parent_page_id, p.title, c.leaf_id
        from pages p
        inner join chain c on p.id = c.parent_page_id
      )
      select leaf_id, id, title, parent_page_id from chain
    `);

    const byLeaf = new Map<string, BreadcrumbRow[]>();
    for (const row of result.rows) {
      const list = byLeaf.get(row.leaf_id) ?? [];
      list.push(row);
      byLeaf.set(row.leaf_id, list);
    }

    const breadcrumbs = new Map<string, string[]>();
    for (const [leafId, chainRows] of byLeaf) {
      const byId = new Map(chainRows.map((r) => [r.id, r]));
      const trail: string[] = [];
      let cursor: string | null = leafId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const row: BreadcrumbRow | undefined = byId.get(cursor);
        if (!row) break;
        trail.unshift(row.title);
        cursor = row.parent_page_id;
      }
      breadcrumbs.set(leafId, trail);
    }
    return breadcrumbs;
  }
}
