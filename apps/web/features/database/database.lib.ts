import type { DatabaseRow } from '@/lib/types';

export interface Filter {
  propertyId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}

export interface Sort {
  propertyId: string;
  direction: 'asc' | 'desc';
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function applyFilter(rows: DatabaseRow[], filter: Filter): DatabaseRow[] {
  return rows.filter((row) => {
    const value = row.values?.[filter.propertyId];
    switch (filter.operator) {
      case 'is_empty':
        return isEmpty(value);
      case 'is_not_empty':
        return !isEmpty(value);
      case 'equals':
        return value === filter.value;
      case 'not_equals':
        return value !== filter.value;
      case 'contains':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.toLowerCase().includes(filter.value.toLowerCase())
        );
      default:
        return true;
    }
  });
}

export function applySort(rows: DatabaseRow[], sort: Sort): DatabaseRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const av = a.values?.[sort.propertyId];
    const bv = b.values?.[sort.propertyId];
    if (isEmpty(av) && isEmpty(bv)) return 0;
    if (isEmpty(av)) return 1; // empties go last
    if (isEmpty(bv)) return -1;

    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return sort.direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}
