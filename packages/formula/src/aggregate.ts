/** The 20 aggregate functions (§20B.1), plus `show_original` for rollup (§24B.2). One definition, shared by column calculations and rollup — this is the JS-side implementation, run over an already-fetched array of values; `apps/api/src/databases/database-query.lib.ts` has the SQL-side implementation of the same function *names* for column calculations, computed directly in Postgres. */
export const aggregateFunctions = [
  'show_original',
  'count_all',
  'count_values',
  'count_unique',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
  'earliest_date',
  'latest_date',
  'date_range',
  'checked',
  'unchecked',
  'percent_checked',
  'percent_unchecked',
] as const;

export type AggregateFunction = (typeof aggregateFunctions)[number];

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function numbers(values: unknown[]): number[] {
  return values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
}

function dates(values: unknown[]): Date[] {
  return values
    .map((v) => (typeof v === 'string' || v instanceof Date ? new Date(v) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Aggregates `values` (rollup's related-row target values, or a column's own values) per §20B.1/§24B.2. */
export function aggregate(fn: AggregateFunction, values: unknown[]): unknown {
  const count = values.length;
  const empty = values.filter(isEmptyValue).length;
  const notEmpty = count - empty;

  switch (fn) {
    case 'show_original':
      return values;
    case 'count_all':
      return count;
    case 'count_values':
      return notEmpty;
    case 'count_unique':
      return new Set(values.map((v) => JSON.stringify(v))).size;
    case 'count_empty':
      return empty;
    case 'count_not_empty':
      return notEmpty;
    case 'percent_empty':
      return count === 0 ? 0 : (empty / count) * 100;
    case 'percent_not_empty':
      return count === 0 ? 0 : (notEmpty / count) * 100;
    case 'sum':
      return numbers(values).reduce((a, b) => a + b, 0);
    case 'average': {
      const nums = numbers(values);
      return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case 'median':
      return median(numbers(values));
    case 'min': {
      const nums = numbers(values);
      return nums.length === 0 ? null : Math.min(...nums);
    }
    case 'max': {
      const nums = numbers(values);
      return nums.length === 0 ? null : Math.max(...nums);
    }
    case 'range': {
      const nums = numbers(values);
      return nums.length === 0 ? null : Math.max(...nums) - Math.min(...nums);
    }
    case 'earliest_date': {
      const ds = dates(values);
      return ds.length === 0 ? null : new Date(Math.min(...ds.map((d) => d.getTime()))).toISOString();
    }
    case 'latest_date': {
      const ds = dates(values);
      return ds.length === 0 ? null : new Date(Math.max(...ds.map((d) => d.getTime()))).toISOString();
    }
    case 'date_range': {
      const ds = dates(values);
      if (ds.length === 0) return null;
      const times = ds.map((d) => d.getTime());
      return (Math.max(...times) - Math.min(...times)) / 86_400_000;
    }
    case 'checked':
      return values.filter((v) => v === true).length;
    case 'unchecked':
      return values.filter((v) => v !== true).length;
    case 'percent_checked': {
      const checked = values.filter((v) => v === true).length;
      return count === 0 ? 0 : (checked / count) * 100;
    }
    case 'percent_unchecked': {
      const checked = values.filter((v) => v === true).length;
      return count === 0 ? 0 : ((count - checked) / count) * 100;
    }
    default: {
      const exhaustive: never = fn;
      throw new Error(`Unknown aggregate function: ${JSON.stringify(exhaustive)}`);
    }
  }
}
