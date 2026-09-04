import { z } from 'zod';
import type { CalculationId, DatabaseRow, FilterOperator, PropertyType } from '@/lib/types';

export type { CalculationId, FilterOperator };

/**
 * Sprint 13 (§11D.3), expanded Sprint 18 (§20A.2, §20B.1, §22A.3): the
 * registry every database-property consumer reads from — filter builder,
 * sort, calculations, CSV export, and search snippet extraction.
 * `filterOperators`/`calculations` gate what the filter/calculation pickers
 * even offer for a column; the server independently re-validates both
 * (§database-query.lib.ts), so this is a UX narrowing, not the enforcement
 * boundary.
 */
export interface PropertyTypeDefinition {
  key: PropertyType;
  label: string;
  icon: string;
  configSchema: z.ZodType;
  filterOperators: FilterOperator[];
  calculations: CalculationId[];
  /** Derived properties (created_time, last_edited_time, unique_id) render read-only — no cell editor. */
  editable: boolean;
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
const optionSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });
const selectConfig = z.object({ options: z.array(optionSchema) });
const statusConfig = z.object({
  options: z.array(optionSchema.extend({ group: z.enum(['todo', 'doing', 'done']) })),
  defaultOptionId: z.string().optional(),
});
const numberConfig = z.object({
  format: z.enum(['plain', 'comma', 'percent', 'currency']),
  currency: z.string().optional(),
  precision: z.number().optional(),
  display: z.enum(['number', 'bar', 'ring']),
});
const dateConfig = z.object({
  includeTime: z.boolean(),
  format: z.string().optional(),
  timeFormat: z.string().optional(),
  endDateEnabled: z.boolean(),
  reminder: z.object({ offsetMinutes: z.number(), timeOfDay: z.string().optional() }).nullable(),
});
const filesConfig = z.object({ maxCount: z.number().optional() });
const uniqueIdConfig = z.object({ prefix: z.string().optional(), nextValue: z.number() });
const relationConfig = z.object({
  targetDatabaseId: z.string(),
  allowMultiple: z.boolean(),
  inversePropertyId: z.string().nullable(),
});
const rollupConfig = z.object({
  relationPropertyId: z.string(),
  targetPropertyId: z.string(),
  function: z.string(),
});
const formulaConfig = z.object({
  source: z.string(),
  ast: z.unknown(),
  volatile: z.boolean(),
  returnType: z.enum(['number', 'string', 'boolean', 'date', 'unknown']),
});

function textCompare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const COMMON_CALCULATIONS: CalculationId[] = [
  'count_all',
  'count_values',
  'count_unique',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
];
const NUMBER_CALCULATIONS: CalculationId[] = [...COMMON_CALCULATIONS, 'sum', 'average', 'median', 'min', 'max', 'range'];
const DATE_CALCULATIONS: CalculationId[] = [...COMMON_CALCULATIONS, 'earliest_date', 'latest_date', 'date_range'];
const CHECKBOX_CALCULATIONS: CalculationId[] = [
  ...COMMON_CALCULATIONS,
  'checked',
  'unchecked',
  'percent_checked',
  'percent_unchecked',
];

const TEXT_LIKE_OPERATORS: FilterOperator[] = [
  'is',
  'is_not',
  'contains',
  'does_not_contain',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
];
const NUMBER_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'is_empty', 'is_not_empty'];
const SELECT_OPERATORS: FilterOperator[] = ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'];
const MULTI_SELECT_OPERATORS: FilterOperator[] = ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'];
const DATE_OPERATORS: FilterOperator[] = [
  'is',
  'is_before',
  'is_after',
  'is_on_or_before',
  'is_on_or_after',
  'is_within',
  'is_empty',
  'is_not_empty',
];
const EMPTY_ONLY_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty'];
const RELATION_OPERATORS: FilterOperator[] = ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'];

// A rollup/formula's actual value kind (number/string/boolean/date) varies
// per-instance (`config.returnType` / the rollup function's output) — the
// registry's `filterOperators`/`calculations` can't branch on that per row,
// so this offers the union of everything any kind could need. The server is
// the real enforcement boundary, same as every other type here (§53).
const COMPUTED_OPERATORS: FilterOperator[] = [
  ...new Set([...TEXT_LIKE_OPERATORS, ...NUMBER_OPERATORS, ...DATE_OPERATORS]),
];
const COMPUTED_CALCULATIONS: CalculationId[] = [
  ...new Set([...NUMBER_CALCULATIONS, ...DATE_CALCULATIONS, ...CHECKBOX_CALCULATIONS]),
];

function computedSortComparator(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const da = Date.parse(String(a ?? ''));
  const db = Date.parse(String(b ?? ''));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return textCompare(a, b);
}

PropertyTypeRegistry.register({
  key: 'title',
  label: 'Title',
  icon: 'Aa',
  configSchema: noConfig,
  filterOperators: TEXT_LIKE_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'text',
  label: 'Text',
  icon: '≡',
  configSchema: noConfig,
  filterOperators: TEXT_LIKE_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'number',
  label: 'Number',
  icon: '#',
  configSchema: numberConfig,
  filterOperators: NUMBER_OPERATORS,
  calculations: NUMBER_CALCULATIONS,
  editable: true,
  sortComparator: (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : textCompare(a, b)),
  toCsv: (value) => (typeof value === 'number' ? String(value) : ''),
  toPlainText: (value) => (typeof value === 'number' ? String(value) : ''),
});

PropertyTypeRegistry.register({
  key: 'select',
  label: 'Select',
  icon: '▾',
  configSchema: selectConfig,
  filterOperators: SELECT_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'multi_select',
  label: 'Multi-select',
  icon: '▤',
  configSchema: selectConfig,
  filterOperators: MULTI_SELECT_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: (a, b) => (Array.isArray(a) ? a.length : 0) - (Array.isArray(b) ? b.length : 0),
  toCsv: (value) => csvEscape(Array.isArray(value) ? value.join('; ') : ''),
  toPlainText: (value) => (Array.isArray(value) ? value.join(' ') : ''),
});

PropertyTypeRegistry.register({
  key: 'status',
  label: 'Status',
  icon: '◍',
  configSchema: statusConfig,
  filterOperators: SELECT_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'checkbox',
  label: 'Checkbox',
  icon: '☑',
  configSchema: noConfig,
  filterOperators: ['is'],
  calculations: CHECKBOX_CALCULATIONS,
  editable: true,
  sortComparator: (a, b) => Number(Boolean(a)) - Number(Boolean(b)),
  toCsv: (value) => String(Boolean(value)),
  toPlainText: (value) => String(Boolean(value)),
});

PropertyTypeRegistry.register({
  key: 'date',
  label: 'Date',
  icon: '📅',
  configSchema: dateConfig,
  filterOperators: DATE_OPERATORS,
  calculations: DATE_CALCULATIONS,
  editable: true,
  sortComparator: (a, b) => Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
  toCsv: (value) => String(value ?? ''),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'url',
  label: 'URL',
  icon: '🔗',
  configSchema: noConfig,
  filterOperators: TEXT_LIKE_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'email',
  label: 'Email',
  icon: '✉',
  configSchema: noConfig,
  filterOperators: TEXT_LIKE_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'phone',
  label: 'Phone',
  icon: '☎',
  configSchema: noConfig,
  filterOperators: TEXT_LIKE_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: textCompare,
  toCsv: (value) => csvEscape(String(value ?? '')),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'files',
  label: 'Files',
  icon: '📎',
  configSchema: filesConfig,
  filterOperators: EMPTY_ONLY_OPERATORS,
  calculations: COMMON_CALCULATIONS,
  editable: true,
  sortComparator: (a, b) => (Array.isArray(a) ? a.length : 0) - (Array.isArray(b) ? b.length : 0),
  toCsv: (value) => csvEscape(Array.isArray(value) ? value.join('; ') : ''),
  toPlainText: (value) => (Array.isArray(value) ? value.join(' ') : ''),
});

PropertyTypeRegistry.register({
  key: 'created_time',
  label: 'Created time',
  icon: '🕓',
  configSchema: noConfig,
  filterOperators: DATE_OPERATORS,
  calculations: DATE_CALCULATIONS,
  editable: false,
  sortComparator: (a, b) => Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
  toCsv: (value) => String(value ?? ''),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'last_edited_time',
  label: 'Last edited time',
  icon: '🕓',
  configSchema: noConfig,
  filterOperators: DATE_OPERATORS,
  calculations: DATE_CALCULATIONS,
  editable: false,
  sortComparator: (a, b) => Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
  toCsv: (value) => String(value ?? ''),
  toPlainText: (value) => String(value ?? ''),
});

PropertyTypeRegistry.register({
  key: 'unique_id',
  label: 'Unique ID',
  icon: '№',
  configSchema: uniqueIdConfig,
  filterOperators: NUMBER_OPERATORS,
  calculations: NUMBER_CALCULATIONS,
  editable: false,
  sortComparator: (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : 0),
  toCsv: (value) => (typeof value === 'number' ? String(value) : ''),
  toPlainText: (value) => (typeof value === 'number' ? String(value) : ''),
});

PropertyTypeRegistry.register({
  key: 'relation',
  label: 'Relation',
  icon: '↔',
  configSchema: relationConfig,
  filterOperators: RELATION_OPERATORS,
  calculations: [], // no natural aggregate — follow the relation to a rollup instead (§24B)
  editable: true, // linking/unlinking rows, via a picker — not a text editor
  sortComparator: (a, b) => (Array.isArray(a) ? a.length : 0) - (Array.isArray(b) ? b.length : 0),
  toCsv: (value) => csvEscape(Array.isArray(value) ? value.join('; ') : ''),
  toPlainText: (value) => (Array.isArray(value) ? value.join(' ') : ''),
});

PropertyTypeRegistry.register({
  key: 'rollup',
  label: 'Rollup',
  icon: '∑',
  configSchema: rollupConfig,
  filterOperators: COMPUTED_OPERATORS,
  calculations: COMPUTED_CALCULATIONS,
  editable: false, // materialized server-side (§24B.3) — no cell editor
  sortComparator: computedSortComparator,
  toCsv: (value) => (value === null || value === undefined ? '' : csvEscape(String(value))),
  toPlainText: (value) => (value === null || value === undefined ? '' : String(value)),
});

PropertyTypeRegistry.register({
  key: 'formula',
  label: 'Formula',
  icon: 'ƒ',
  configSchema: formulaConfig,
  filterOperators: COMPUTED_OPERATORS,
  calculations: COMPUTED_CALCULATIONS,
  editable: false, // materialized server-side (§24A.5) — no cell editor
  sortComparator: computedSortComparator,
  toCsv: (value) => (value === null || value === undefined ? '' : csvEscape(String(value))),
  toPlainText: (value) => (value === null || value === undefined ? '' : String(value)),
});

export const COMPUTED_TYPES = new Set<PropertyType>(['rollup', 'formula']);

/** A cell's current value for one property — `formula`/`rollup` read `row.computed`, everything else reads `row.values` (§24A, §24B). The one place every reader (`Cell`, `rowToPlainText`, CSV export) should go through, so a value never gets read from the wrong side of the row. */
export function cellValue(row: DatabaseRow, property: { id: string; type: PropertyType }): unknown {
  const source = COMPUTED_TYPES.has(property.type) ? row.computed : row.values;
  return source?.[property.id];
}

/** Extracts every cell's plain text for a row — search snippets (§25A). */
export function rowToPlainText(
  row: DatabaseRow,
  properties: { id: string; type: PropertyType }[],
): string {
  return properties
    .map((p) => PropertyTypeRegistry.get(p.type)?.toPlainText(cellValue(row, p)) ?? '')
    .filter(Boolean)
    .join(' ');
}
