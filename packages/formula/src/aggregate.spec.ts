import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate';

describe('aggregate', () => {
  it('show_original returns the values as-is', () => {
    expect(aggregate('show_original', [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('count family', () => {
    const values = [1, null, 2, '', 3];
    expect(aggregate('count_all', values)).toBe(5);
    expect(aggregate('count_values', values)).toBe(3);
    expect(aggregate('count_empty', values)).toBe(2);
    expect(aggregate('count_not_empty', values)).toBe(3);
    expect(aggregate('count_unique', [1, 1, 2])).toBe(2);
  });

  it('percent_empty / percent_not_empty', () => {
    expect(aggregate('percent_empty', [1, null, null, null])).toBe(75);
    expect(aggregate('percent_not_empty', [1, null, null, null])).toBe(25);
  });

  it('percent_empty on an empty array is 0, not NaN', () => {
    expect(aggregate('percent_empty', [])).toBe(0);
  });

  it('numeric aggregates ignore non-numeric values', () => {
    expect(aggregate('sum', [1, 2, 'x', null, 3])).toBe(6);
    expect(aggregate('average', [2, 4, 6])).toBe(4);
    expect(aggregate('median', [1, 3, 2])).toBe(2);
    expect(aggregate('median', [1, 2, 3, 4])).toBe(2.5);
    expect(aggregate('min', [3, 1, 2])).toBe(1);
    expect(aggregate('max', [3, 1, 2])).toBe(3);
    expect(aggregate('range', [3, 1, 5])).toBe(4);
  });

  it('numeric aggregates return null (not NaN/Infinity) on no numeric values', () => {
    expect(aggregate('average', ['a', 'b'])).toBeNull();
    expect(aggregate('min', [])).toBeNull();
  });

  it('date aggregates', () => {
    const values = ['2026-01-10T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-05T00:00:00.000Z'];
    expect(aggregate('earliest_date', values)).toBe('2026-01-01T00:00:00.000Z');
    expect(aggregate('latest_date', values)).toBe('2026-01-10T00:00:00.000Z');
    expect(aggregate('date_range', values)).toBe(9);
  });

  it('checkbox aggregates', () => {
    const values = [true, false, true, true];
    expect(aggregate('checked', values)).toBe(3);
    expect(aggregate('unchecked', values)).toBe(1);
    expect(aggregate('percent_checked', values)).toBe(75);
    expect(aggregate('percent_unchecked', values)).toBe(25);
  });
});
