import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  buildCalculationSql,
  buildFilterSql,
  buildKeysetSql,
  buildSortSql,
  decodeCursor,
  encodeCursor,
  resolveRelativeDateRange,
  type PropertyMeta,
} from './database-query.lib';

const dialect = new PgDialect();
function render(expr: Parameters<PgDialect['sqlToQuery']>[0]) {
  return dialect.sqlToQuery(expr);
}

const TITLE: PropertyMeta = { id: 'p-title', type: 'title' };
const NUMBER: PropertyMeta = { id: 'p-num', type: 'number' };
const SELECT: PropertyMeta = { id: 'p-select', type: 'select' };
const MULTI: PropertyMeta = { id: 'p-multi', type: 'multi_select' };
const CHECKBOX: PropertyMeta = { id: 'p-check', type: 'checkbox' };
const DATE: PropertyMeta = { id: 'p-date', type: 'date' };
const CREATED: PropertyMeta = { id: 'p-created', type: 'created_time' };
const UNIQUE: PropertyMeta = { id: 'p-uid', type: 'unique_id' };

const propsById = new Map(
  [TITLE, NUMBER, SELECT, MULTI, CHECKBOX, DATE, CREATED, UNIQUE].map((p) => [p.id, p]),
);

describe('buildFilterSql', () => {
  it('returns undefined for a null filter', () => {
    expect(buildFilterSql(null, propsById)).toBeUndefined();
  });

  it('builds a single text "contains" rule case-insensitively', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: TITLE.id, operator: 'contains', value: 'foo' }] },
      propsById,
    )!;
    const { sql, params } = render(expr);
    expect(sql).toContain('ilike');
    expect(params).toContain('%foo%');
  });

  it('combines rules with AND', () => {
    const expr = buildFilterSql(
      {
        conjunction: 'and',
        rules: [
          { propertyId: NUMBER.id, operator: '>', value: 5 },
          { propertyId: NUMBER.id, operator: '<', value: 10 },
        ],
      },
      propsById,
    )!;
    const { sql, params } = render(expr);
    expect(sql).toMatch(/and/);
    expect(params).toEqual(expect.arrayContaining([5, 10]));
  });

  it('nests OR inside AND', () => {
    const expr = buildFilterSql(
      {
        conjunction: 'and',
        rules: [
          { propertyId: SELECT.id, operator: 'is', value: 'todo' },
          {
            conjunction: 'or',
            rules: [
              { propertyId: NUMBER.id, operator: '=', value: 1 },
              { propertyId: NUMBER.id, operator: '=', value: 2 },
            ],
          },
        ],
      },
      propsById,
    )!;
    const { sql } = render(expr);
    expect(sql).toMatch(/or/);
    expect(sql).toMatch(/and/);
  });

  it('drops a rule referencing an unknown property instead of throwing', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: 'ghost', operator: 'is', value: 'x' }] },
      propsById,
    );
    expect(expr).toBeUndefined();
  });

  it('builds is_empty for a multi_select using jsonb_array_length', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: MULTI.id, operator: 'is_empty' }] },
      propsById,
    )!;
    expect(render(expr).sql).toContain('jsonb_array_length');
  });

  it('builds a checkbox "is" rule', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: CHECKBOX.id, operator: 'is', value: true }] },
      propsById,
    )!;
    const { params } = render(expr);
    expect(params).toContain(true);
  });

  it('resolves a relative date token for is_within', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: DATE.id, operator: 'is_within', value: 'today' }] },
      propsById,
    )!;
    const { sql, params } = render(expr);
    expect(sql).toContain('>=');
    // The property id is a raw literal (not a bind param, see extractionSql's
    // comment) — only the two range bounds are parameters.
    expect(params).toHaveLength(2);
  });

  it('uses the created_at column directly for created_time, not the JSONB values', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: CREATED.id, operator: 'is_after', value: 'today' }] },
      propsById,
    )!;
    expect(render(expr).sql).toContain('created_at');
  });

  it('uses the unique_id_seq column for unique_id numeric comparisons', () => {
    const expr = buildFilterSql(
      { conjunction: 'and', rules: [{ propertyId: UNIQUE.id, operator: '>', value: 5 }] },
      propsById,
    )!;
    expect(render(expr).sql).toContain('unique_id_seq');
  });
});

describe('buildSortSql', () => {
  it('always tie-breaks on id', () => {
    const clauses = buildSortSql([], propsById);
    expect(clauses).toHaveLength(1);
    expect(render(clauses[0]).sql).toContain('id');
  });

  it('emits one clause per known sort, skipping unknown properties', () => {
    const clauses = buildSortSql(
      [
        { propertyId: NUMBER.id, direction: 'desc' },
        { propertyId: 'ghost', direction: 'asc' },
      ],
      propsById,
    );
    expect(clauses).toHaveLength(2); // number desc + id tiebreak
    expect(render(clauses[0]).sql).toContain('desc');
  });
});

describe('buildCalculationSql', () => {
  it('emits count_all for any property type', () => {
    const [result] = buildCalculationSql([{ propertyId: TITLE.id, calculationId: 'count_all' }], propsById);
    expect(render(result.expr).sql).toContain('count(*)');
  });

  it('emits sum only meaningfully for number-typed properties', () => {
    const [result] = buildCalculationSql([{ propertyId: NUMBER.id, calculationId: 'sum' }], propsById);
    expect(render(result.expr).sql).toContain('sum(');
  });

  it('omits sum for a non-numeric property instead of throwing', () => {
    const results = buildCalculationSql([{ propertyId: TITLE.id, calculationId: 'sum' }], propsById);
    expect(results).toHaveLength(0);
  });

  it('emits checked/unchecked only for checkbox properties', () => {
    const results = buildCalculationSql(
      [
        { propertyId: CHECKBOX.id, calculationId: 'checked' },
        { propertyId: TITLE.id, calculationId: 'checked' },
      ],
      propsById,
    );
    expect(results).toHaveLength(1);
    expect(results[0].propertyId).toBe(CHECKBOX.id);
  });

  it('emits date_range for a date property', () => {
    const [result] = buildCalculationSql([{ propertyId: DATE.id, calculationId: 'date_range' }], propsById);
    expect(render(result.expr).sql).toContain('extract');
  });
});

describe('cursor encode/decode', () => {
  it('round-trips a cursor', () => {
    const cursor = { values: [1, 'x', null], id: 'row-1' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('returns null for garbage input instead of throwing', () => {
    expect(decodeCursor('not-a-valid-cursor!!')).toBeNull();
  });
});

describe('buildKeysetSql', () => {
  it('builds a single-sort keyset predicate', () => {
    const expr = buildKeysetSql([{ propertyId: NUMBER.id, direction: 'asc' }], propsById, {
      values: [5],
      id: 'row-1',
    })!;
    const { sql, params } = render(expr);
    expect(sql).toContain('>');
    expect(params).toEqual(expect.arrayContaining([5, 'row-1']));
  });

  it('flips the comparison for a descending sort', () => {
    const expr = buildKeysetSql([{ propertyId: NUMBER.id, direction: 'desc' }], propsById, {
      values: [5],
      id: 'row-1',
    })!;
    expect(render(expr).sql).toContain('<');
  });

  it('falls back to the id-only branch when there are no sorts', () => {
    const expr = buildKeysetSql([], propsById, { values: [], id: 'row-1' })!;
    const { sql, params } = render(expr);
    expect(sql).toContain('id');
    expect(params).toEqual(['row-1']);
  });

  it('skips the exact-boundary branch for a null cursor value', () => {
    const expr = buildKeysetSql([{ propertyId: NUMBER.id, direction: 'asc' }], propsById, {
      values: [null],
      id: 'row-1',
    });
    // only the id-tiebreak branch remains, since ">" null can't be expressed
    expect(expr).toBeDefined();
    expect(render(expr!).sql).toContain('id');
  });
});

describe('resolveRelativeDateRange', () => {
  it('resolves "today" to a 24h range starting at local midnight', () => {
    const now = new Date(2026, 2, 15, 13, 30);
    const range = resolveRelativeDateRange('today', now)!;
    expect(range.start).toEqual(new Date(2026, 2, 15));
    expect(range.end).toEqual(new Date(2026, 2, 16));
  });

  it('resolves "yesterday" and "tomorrow" relative to today', () => {
    const now = new Date(2026, 2, 15, 8, 0);
    expect(resolveRelativeDateRange('yesterday', now)!.start).toEqual(new Date(2026, 2, 14));
    expect(resolveRelativeDateRange('tomorrow', now)!.start).toEqual(new Date(2026, 2, 16));
  });

  it('returns null for an unrecognized token', () => {
    expect(resolveRelativeDateRange('next_century')).toBeNull();
  });
});
