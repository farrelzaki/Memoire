import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  buildHeadlineSql,
  buildJsonAllStringsSql,
  buildJsonPlainTextSql,
  buildRankSql,
  buildSubtreePageIdsCte,
  buildTitleTrigramSql,
  buildTsQuerySql,
  RECENCY_HALF_LIFE_SECONDS,
  resolveSearchTimeRangeBoundary,
  SEARCH_SOURCE_WEIGHT,
  SNIPPET_MATCH_END,
  SNIPPET_MATCH_START,
} from './search-query.lib';

const dialect = new PgDialect();
function render(expr: Parameters<PgDialect['sqlToQuery']>[0]) {
  return dialect.sqlToQuery(expr);
}

describe('buildTsQuerySql', () => {
  it('builds a prefix tsquery for quick mode', () => {
    const { sql: rendered, params } = render(buildTsQuerySql('hel', 'quick'));
    expect(rendered).toContain('to_tsquery');
    expect(rendered).toContain("':*'");
    expect(params).toContain('hel');
  });

  it('builds a websearch tsquery for full mode', () => {
    const { sql: rendered, params } = render(buildTsQuerySql('hello world', 'full'));
    expect(rendered).toContain('websearch_to_tsquery');
    expect(params).toContain('hello world');
  });
});

describe('buildTitleTrigramSql', () => {
  it('uses the pg_trgm similarity operator', () => {
    const { sql: rendered, params } = render(buildTitleTrigramSql(sql`title`, 'hel'));
    expect(rendered).toContain('%');
    expect(params).toContain('hel');
  });
});

describe('buildRankSql', () => {
  it('multiplies ts_rank_cd by the source weight and a recency decay factor', () => {
    const { sql: rendered, params } = render(
      buildRankSql(sql`search_vector`, sql`query`, SEARCH_SOURCE_WEIGHT.page, sql`updated_at`),
    );
    expect(rendered).toContain('ts_rank_cd');
    expect(rendered).toContain('exp(');
    expect(rendered).toContain('extract(epoch from');
    expect(params).toContain(SEARCH_SOURCE_WEIGHT.page);
    expect(params).toContain(RECENCY_HALF_LIFE_SECONDS);
  });

  it('accepts a custom half-life', () => {
    const { params } = render(buildRankSql(sql`sv`, sql`q`, 1, sql`updated_at`, 3600));
    expect(params).toContain(3600);
  });
});

describe('buildHeadlineSql', () => {
  it('wraps ts_headline with a fragment/word budget and control-character delimiters', () => {
    const { sql: rendered, params } = render(buildHeadlineSql(sql`title`, sql`query`));
    expect(rendered).toContain('ts_headline');
    const options = params.find((p) => typeof p === 'string' && p.includes('MaxFragments'));
    expect(options).toBeDefined();
    expect(options).toContain(SNIPPET_MATCH_START);
    expect(options).toContain(SNIPPET_MATCH_END);
  });
});

describe('buildJsonPlainTextSql', () => {
  it('extracts and joins string leaves from a JSONB column', () => {
    const { sql: rendered } = render(buildJsonPlainTextSql(sql`content`));
    expect(rendered).toContain('jsonb_path_query_array');
    expect(rendered).toContain("'$.**.text'");
    expect(rendered).toContain('string_agg');
  });
});

describe('buildJsonAllStringsSql', () => {
  it('extracts all string leaves, unscoped by key name', () => {
    const { sql: rendered } = render(buildJsonAllStringsSql(sql`values`));
    expect(rendered).toContain('jsonb_path_query_array');
    expect(rendered).toContain('type() == "string"');
    expect(rendered).toContain('string_agg');
  });
});

describe('resolveSearchTimeRangeBoundary', () => {
  const now = new Date('2026-03-15T12:00:00Z');

  it('resolves 7d to 7 days before now', () => {
    const boundary = resolveSearchTimeRangeBoundary('7d', now);
    expect(boundary.toISOString()).toBe('2026-03-08T12:00:00.000Z');
  });

  it('resolves 30d to 30 days before now', () => {
    const boundary = resolveSearchTimeRangeBoundary('30d', now);
    expect(boundary.toISOString()).toBe('2026-02-13T12:00:00.000Z');
  });

  it('resolves year to one year before now', () => {
    const boundary = resolveSearchTimeRangeBoundary('year', now);
    expect(boundary.toISOString()).toBe('2025-03-15T12:00:00.000Z');
  });

  it('defaults now to the current time when omitted', () => {
    const before = Date.now();
    const boundary = resolveSearchTimeRangeBoundary('7d');
    const after = Date.now();
    expect(boundary.getTime()).toBeGreaterThanOrEqual(before - 7 * 24 * 60 * 60 * 1000);
    expect(boundary.getTime()).toBeLessThanOrEqual(after - 7 * 24 * 60 * 60 * 1000);
  });
});

describe('buildSubtreePageIdsCte', () => {
  it('builds a recursive CTE selecting the page and its descendants', () => {
    const { sql: rendered, params } = render(buildSubtreePageIdsCte('page-1'));
    expect(rendered).toContain('with recursive subtree');
    expect(rendered).toContain('parent_page_id');
    expect(params).toContain('page-1');
  });
});
