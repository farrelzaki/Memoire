import { describe, expect, it } from 'vitest';
import { boardGroupKey, sameDay, toDateOnly } from './database-views';

// neighborsAfterDrag/useDragSensors moved to apps/web/lib/dnd.spec.ts in Sprint 22.

describe('boardGroupKey', () => {
  it('is the option id at the top level', () => {
    expect(boardGroupKey('opt-1')).toBe('opt-1');
  });

  it('maps a null (no-status) option to the empty-group sentinel', () => {
    expect(boardGroupKey(null)).toBe('__empty__');
  });

  it('combines group and sub-group ids when sub-grouping', () => {
    expect(boardGroupKey('opt-1', 'sub-1')).toBe('opt-1:sub-1');
    expect(boardGroupKey('opt-1', null)).toBe('opt-1:__empty__');
    expect(boardGroupKey(null, null)).toBe('__empty__:__empty__');
  });
});

describe('toDateOnly / sameDay (calendar drag/resize, Sprint 21)', () => {
  it('formats a local date as YYYY-MM-DD, zero-padded', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateOnly(new Date(2026, 10, 25))).toBe('2026-11-25');
  });

  it('treats two Date objects on the same calendar day as equal regardless of time', () => {
    expect(sameDay(new Date(2026, 2, 15, 1, 0), new Date(2026, 2, 15, 23, 59))).toBe(true);
    expect(sameDay(new Date(2026, 2, 15), new Date(2026, 2, 16))).toBe(false);
  });
});
