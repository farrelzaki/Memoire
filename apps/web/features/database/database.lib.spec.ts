import { describe, expect, it } from 'vitest';
import { applyFilter, applySort, mergeRowValues } from './database.lib';
import type { DatabaseRow } from '@/lib/types';

function row(id: string, values: Record<string, unknown>): DatabaseRow {
  return {
    id,
    databaseId: 'db',
    pageId: null,
    values,
    position: 0,
    createdAt: '',
    updatedAt: '',
  };
}

const rows = [
  row('a', { title: 'Alpha', status: 'Done', done: true, n: 2 }),
  row('b', { title: 'beta', status: 'Todo', done: false, n: 10 }),
  row('c', { title: 'Gamma', status: 'Done' }),
];

describe('applyFilter', () => {
  it('filters equals on a select value', () => {
    const out = applyFilter(rows, { propertyId: 'status', operator: 'equals', value: 'Done' });
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('filters contains (case-insensitive) on text', () => {
    const out = applyFilter(rows, { propertyId: 'title', operator: 'contains', value: 'ET' });
    expect(out.map((r) => r.id)).toEqual(['b']);
  });

  it('filters is_empty', () => {
    const out = applyFilter(rows, { propertyId: 'n', operator: 'is_empty' });
    expect(out.map((r) => r.id)).toEqual(['c']);
  });
});

describe('applySort', () => {
  it('sorts numbers ascending with empties last', () => {
    const out = applySort(rows, { propertyId: 'n', direction: 'asc' });
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts text descending', () => {
    const out = applySort(rows, { propertyId: 'title', direction: 'desc' });
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('mergeRowValues', () => {
  it('keeps every existing property, not just the one that changed', () => {
    const out = mergeRowValues(rows[0], 'status', 'Todo');
    expect(out).toEqual({ title: 'Alpha', status: 'Todo', done: true, n: 2 });
  });

  it('adds a new property without dropping the rest (§10B.5 invariant 15)', () => {
    const out = mergeRowValues(rows[2], 'done', true);
    expect(out).toEqual({ title: 'Gamma', status: 'Done', done: true });
  });

  it('does not mutate the row it reads from', () => {
    const original = { ...rows[0].values };
    mergeRowValues(rows[0], 'status', 'Todo');
    expect(rows[0].values).toEqual(original);
  });

  it('handles a row with no values yet', () => {
    const out = mergeRowValues(row('d', {} as Record<string, unknown>), 'status', 'Todo');
    expect(out).toEqual({ status: 'Todo' });
  });
});
