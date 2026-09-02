import { z } from 'zod';
import type { DatabaseRow, PropertyType } from '@/lib/types';

/**
 * Sprint 13 (§11D.3): the registry every database-property consumer reads
 * from — filter builder, sort, CSV export, and search snippet extraction.
 * `cellRenderer`/`editorRenderer` stay untyped React component slots for
 * now — wiring `database-views.tsx`'s `Cell` switch through them is Sprint
 * 18/21 work (view/filter/rollup build-out), tracked in `docs/97-progress.md`.
 */
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

export type Calculation = 'count' | 'count_values' | 'count_empty' | 'count_not_empty';

export interface PropertyTypeDefinition {
  key: PropertyType;
  label: string;
  icon: string;
  configSchema: z.ZodType;
  filterOperators: FilterOperator[];
  calculations: Calculation[];
  sortComparator(a: unknown, b: unknown): number;
  toCsv(value: unknown): string;
  toPlainText(value: unknown): string;
}

class PropertyTypeRegistryClass {
  private readonly types = new Map<PropertyType, PropertyTypeDefinition>();

  register(def: PropertyTypeDefinition): this {
    this.types.set(def.key, def);
    return this;
  }

  get(key: PropertyType): PropertyTypeDefinition | undefined {
    return this.types.get(key);
  }

  list(): PropertyTypeDefinition[] {
    return [...this.types.values()];
  }
}

export const PropertyTypeRegistry = new PropertyTypeRegistryClass();

// ---------------------------------------------------------------------------

const noConfig = z.object({}).strict();
const selectConfig = z.object({ options: z.array(z.string()) });

function textCompare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const NUMERIC_CALCULATIONS: Calculation[] = ['count', 'count_values', 'count_empty', 'count_not_empty'];

PropertyTypeRegistry.register({
  key: 'title',
  label: 'Title',
  icon: 'Aa',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
  calculations: NUMERIC_CALCULATIONS,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'text',
  label: 'Text',
  icon: '≡',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
  calculations: NUMERIC_CALCULATIONS,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'number',
  label: 'Number',
  icon: '#',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  calculations: [...NUMERIC_CALCULATIONS, 'count'],
  sortComparator: (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : textCompare(a, b)),
  toCsv: (value) => (typeof value === 'number' ? String(value) : ''),
  toPlainText: (value) => (typeof value === 'number' ? String(value) : ''),
});

PropertyTypeRegistry.register({
  key: 'select',
  label: 'Select',
  icon: '▾',
  configSchema: selectConfig,
  filterOperators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  calculations: NUMERIC_CALCULATIONS,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'checkbox',
  label: 'Checkbox',
  icon: '☑',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals'],
  calculations: ['count', 'count_values'],
  sortComparator: (a, b) => Number(Boolean(a)) - Number(Boolean(b)),
  toCsv: (value) => String(Boolean(value)),
  toPlainText: (value) => String(Boolean(value)),
});

PropertyTypeRegistry.register({
  key: 'date',
  label: 'Date',
  icon: '📅',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  calculations: NUMERIC_CALCULATIONS,
  sortComparator: (a, b) => Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
  toCsv: (value) => String(value ?? ''),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'url',
  label: 'URL',
  icon: '🔗',
  configSchema: noConfig,
  filterOperators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
  calculations: NUMERIC_CALCULATIONS,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

/** Extracts every cell's plain text for a row — search snippets (§25A). */
export function rowToPlainText(
  row: DatabaseRow,
  properties: { id: string; type: PropertyType }[],
): string {
  return properties
    .map((p) => PropertyTypeRegistry.get(p.type)?.toPlainText(row.values?.[p.id]) ?? '')
    .filter(Boolean)
    .join(' ');
}
