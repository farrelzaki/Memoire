import { describe, expect, it } from 'vitest';
import type { DrizzleDB } from '../db/drizzle.provider';
import { DatabaseQueryService, rollupValueKind, valueKindOf } from './database-query.service';

describe('rollupValueKind', () => {
  it('maps earliest_date/latest_date to date', () => {
    expect(rollupValueKind('earliest_date')).toBe('date');
    expect(rollupValueKind('latest_date')).toBe('date');
  });

  it('maps show_original to unknown', () => {
    expect(rollupValueKind('show_original')).toBe('unknown');
  });

  it('maps every other function (sum, count_all, checked, date_range, ...) to number', () => {
    for (const fn of ['sum', 'count_all', 'average', 'checked', 'percent_checked', 'date_range', 'median']) {
      expect(rollupValueKind(fn)).toBe('number');
    }
  });
});

describe('valueKindOf', () => {
  it('reads returnType off a formula config', () => {
    const property = { type: 'formula', config: { returnType: 'number' } } as never;
    expect(valueKindOf(property)).toBe('number');
  });

  it('derives a rollup valueKind from its function', () => {
    const property = { type: 'rollup', config: { function: 'latest_date' } } as never;
    expect(valueKindOf(property)).toBe('date');
  });

  it('returns undefined for every other property type', () => {
    const property = { type: 'number', config: null } as never;
    expect(valueKindOf(property)).toBeUndefined();
  });
});

/** Minimal fake matching `db.select({...}).from(table).where()` for the relation batch query. */
function fakeDb(links: unknown[]): DrizzleDB {
  return {
    select: () => ({
      from: () => ({
        where: async () => links,
      }),
    }),
  } as unknown as DrizzleDB;
}

describe('DatabaseQueryService.projectRelations', () => {
  it('groups database_relation_links rows into values[relationPropertyId] = toRowId[] per row', async () => {
    const links = [
      { propertyId: 'rel', fromRowId: 'row-1', toRowId: 'task-a' },
      { propertyId: 'rel', fromRowId: 'row-1', toRowId: 'task-b' },
      { propertyId: 'rel', fromRowId: 'row-2', toRowId: 'task-c' },
    ];
    const service = new DatabaseQueryService(fakeDb(links));
    const rows = [
      { id: 'row-1', values: {}, computed: {} },
      { id: 'row-2', values: {}, computed: {} },
      { id: 'row-3', values: {}, computed: {} }, // no links — should pass through unchanged
    ] as never[];
    const properties = [{ id: 'rel', type: 'relation' }] as never[];

    const result = await (service as unknown as { projectRelations: typeof service['projectRelations'] }).projectRelations(
      rows,
      properties,
    );

    expect(result[0].values).toEqual({ rel: ['task-a', 'task-b'] });
    expect(result[1].values).toEqual({ rel: ['task-c'] });
    expect(result[2]).toBe(rows[2]); // untouched, same reference
  });

  it('skips the query entirely when there are no relation properties', async () => {
    const service = new DatabaseQueryService(fakeDb([]));
    let queried = false;
    (service as unknown as { db: unknown }).db = {
      select: () => {
        queried = true;
        return { from: () => ({ where: async () => [] }) };
      },
    };
    const rows = [{ id: 'row-1', values: {}, computed: {} }] as never[];

    const result = await (service as unknown as { projectRelations: typeof service['projectRelations'] }).projectRelations(
      rows,
      [{ id: 'text-prop', type: 'text' }] as never[],
    );

    expect(result).toBe(rows);
    expect(queried).toBe(false);
  });
});

describe('DatabaseQueryService.cursorValueFor', () => {
  it('reads a numeric-valued formula from computed', () => {
    const service = new DatabaseQueryService(fakeDb([]));
    const row = { computed: { total: 42 } } as never;
    const prop = { id: 'total', type: 'formula', valueKind: 'number' } as never;
    const value = (service as unknown as { cursorValueFor: typeof service['cursorValueFor'] }).cursorValueFor(row, prop);
    expect(value).toBe(42);
  });

  it('returns null for a formula with no computed value yet', () => {
    const service = new DatabaseQueryService(fakeDb([]));
    const row = { computed: {} } as never;
    const prop = { id: 'total', type: 'formula', valueKind: 'number' } as never;
    const value = (service as unknown as { cursorValueFor: typeof service['cursorValueFor'] }).cursorValueFor(row, prop);
    expect(value).toBeNull();
  });
});
