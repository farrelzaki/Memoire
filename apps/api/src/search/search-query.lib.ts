import { sql, type SQL } from 'drizzle-orm';
import type { SearchTimeRangeFilter } from '@memoire/validation';

/**
 * Pure SQL-fragment builders for search ranking (§25A, Sprint 23) — no DB
 * access, unit-tested by rendering the fragments (mirrors
 * `../databases/database-query.lib.ts`'s role and test style).
 */

/** Weight per source in the ranked UNION ALL (§25A.4). */
export const SEARCH_SOURCE_WEIGHT = {
  page: 3.0,
  database: 2.0,
  row: 1.2,
  block: 1.0,
} as const;

/**
 * Recency half-life for the `ts_rank_cd` decay factor. §25A.4 specifies decay
 * without a number — 30 days is chosen here (documented in ADR-24): recent
 * enough that a page edited this week visibly outranks one from a year ago,
 * loose enough that month-old notes don't vanish from results.
 */
export const RECENCY_HALF_LIFE_SECONDS = 30 * 24 * 60 * 60;

/**
 * `mode` is explicit, not inferred from query length (see `packages/validation/src/search.ts`).
 * `'quick'` — prefix match, for live-typing callers (command palette, `Ctrl+P` switcher) where
 * the last word is usually still being typed. `'full'` — `websearch_to_tsquery`, supporting
 * quoted phrases and `-exclusions`, for the deliberate, complete queries typed into `/search`.
 */
export function buildTsQuerySql(q: string, mode: 'quick' | 'full'): SQL {
  if (mode === 'quick') {
    return sql`to_tsquery('simple', quote_literal(${q}) || ':*')`;
  }
  return sql`websearch_to_tsquery('simple', ${q})`;
}

/**
 * `pg_trgm` similarity match on a title column — quick mode's fallback for
 * queries too short for a meaningful prefix tsquery match (e.g. a single
 * character), and typo tolerance that `to_tsquery` alone doesn't provide.
 */
export function buildTitleTrigramSql(titleColumn: SQL, q: string): SQL {
  return sql`${titleColumn} % ${q}`;
}

/**
 * `ts_rank_cd` weighted by source and decayed by recency. `updatedAt` must be
 * a `timestamptz` SQL expression; the decay factor is `exp(-age / halfLife)`,
 * so a row exactly one half-life old ranks at ~37% of a fresh one.
 */
export function buildRankSql(
  searchVector: SQL,
  tsQuery: SQL,
  weight: number,
  updatedAt: SQL,
  halfLifeSeconds: number = RECENCY_HALF_LIFE_SECONDS,
): SQL {
  return sql`(ts_rank_cd(${searchVector}, ${tsQuery}) * ${weight} * exp(-extract(epoch from (now() - ${updatedAt})) / ${halfLifeSeconds}))`;
}

/**
 * SOH/STX (ASCII 1/2) delimit matched terms in `ts_headline` output instead
 * of the default `<b>`/`</b>` — control characters that can't appear in real
 * note text, so the frontend can split the snippet on them and wrap matches
 * in `<mark>` via plain JSX rather than `dangerouslySetInnerHTML` (no other
 * list view in this codebase injects raw HTML; keeping it that way here too).
 */
export const SNIPPET_MATCH_START = String.fromCharCode(1);
export const SNIPPET_MATCH_END = String.fromCharCode(2);

/** `ts_headline` snippet over a plaintext SQL expression (see `search.service.ts` for the per-branch text extraction). */
export function buildHeadlineSql(plainText: SQL, tsQuery: SQL): SQL {
  const options = `StartSel=${SNIPPET_MATCH_START}, StopSel=${SNIPPET_MATCH_END}, MaxFragments=1, MaxWords=20, MinWords=5`;
  return sql`ts_headline('simple', ${plainText}, ${tsQuery}, ${options})`;
}

/**
 * SQL-side plaintext extraction for a JSONB Tiptap document — every string
 * leaf in the tree, space-joined. Deliberately not routed through
 * `BlockTypeRegistry.toPlainText` (frontend-only, bundles a Tiptap extension
 * object — not portable to NestJS) — see ADR-24. Loses block-specific
 * formatting (a table row reads as flat words), which is acceptable for a
 * search snippet. Scoped to keys literally named `text` — Tiptap's own
 * text-node field — which is also what excludes its `type`/other
 * discriminator keys from matching (see `blocks.searchVector` in
 * `db/schema.ts` for the matching generated-column expression).
 */
export function buildJsonPlainTextSql(jsonbColumn: SQL): SQL {
  return sql`(select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(${jsonbColumn}, '$.**.text')) as t(value))`;
}

/**
 * Every string leaf anywhere in a JSONB tree, space-joined — for
 * `database_rows.values`, which (unlike `blocks.content`) is keyed by
 * property id, not a Tiptap-shaped `type`/`text` structure, so there is no
 * discriminator-key pollution to scope around here.
 */
export function buildJsonAllStringsSql(jsonbColumn: SQL): SQL {
  return sql`(select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(${jsonbColumn}, '$.**?(@.type() == "string")')) as t(value))`;
}

/**
 * A fixed `Date` boundary for `timeRange` filters, computed in TS (not
 * embedded as a `now()`-relative SQL expression) so it stays independently
 * testable and deterministic per-request.
 */
export function resolveSearchTimeRangeBoundary(
  token: SearchTimeRangeFilter,
  now: Date = new Date(),
): Date {
  const boundary = new Date(now);
  switch (token) {
    case '7d':
      boundary.setDate(boundary.getDate() - 7);
      return boundary;
    case '30d':
      boundary.setDate(boundary.getDate() - 30);
      return boundary;
    case 'year':
      boundary.setFullYear(boundary.getFullYear() - 1);
      return boundary;
    default: {
      const exhaustive: never = token;
      throw new Error(`Unknown time range token: ${exhaustive as string}`);
    }
  }
}

/**
 * Descendant page ids of `locationPageId` (inclusive) via a recursive CTE —
 * the server-side equivalent of `apps/web/lib/pages.ts`'s `getSubtreeIds`,
 * which only works client-side over an already-fetched flat list. Returns a
 * `SELECT id FROM subtree` fragment meant to be used inside an `IN (...)`
 * predicate alongside a `WITH RECURSIVE subtree AS (...)` clause prepended
 * to the branch query (Drizzle has no first-class recursive-CTE builder, so
 * this stays a hand-composed fragment).
 */
export function buildSubtreePageIdsCte(locationPageId: string): SQL {
  return sql`
    with recursive subtree as (
      select id from pages where id = ${locationPageId}
      union all
      select p.id from pages p inner join subtree s on p.parent_page_id = s.id
    )
  `;
}
