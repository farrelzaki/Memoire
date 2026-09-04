import { z } from 'zod';
import { uuid } from './primitives';
import { viewTypes } from './database';

/**
 * `database_views.config` (§21A). Versioned, validated, and read/written
 * through `migrateViewConfig` on every read AND write (§21A.2) — nothing
 * here is ever trusted to already be well-formed, since it can come from an
 * older build or a hand-restored backup.
 *
 * The view's own `type` (table/board/...) lives in the `database_views.type`
 * column, not inside `config` — `getViewConfigSchema`/`migrateViewConfig`
 * take it as a parameter instead of duplicating it into the JSON.
 */

// ---------------------------------------------------------------------------
// Filter (§22, §22A.3, §22A.4)

export const filterOperators = [
  'is',
  'is_not',
  'contains',
  'does_not_contain',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'is_any_of',
  'is_none_of',
  'is_before',
  'is_after',
  'is_on_or_before',
  'is_on_or_after',
  'is_within',
] as const;

export type FilterOperator = (typeof filterOperators)[number];

/** Relative date tokens accepted as a filter `value` for date operators (§22A.3). */
export const relativeDateTokens = [
  'today',
  'tomorrow',
  'yesterday',
  'this_week',
  'past_week',
  'next_week',
  'past_month',
  'next_month',
  'past_year',
  'next_year',
] as const;

// Deliberately loose (not typed per-operator): a filter rule's value shape
// depends on {property type × operator}, and encoding that combinatorially
// here would duplicate PropertyTypeRegistry's job. `database-query.lib.ts`
// and the frontend's filter editor are what actually constrain it per-field.
const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.null(),
]);

export const filterRuleSchema = z.object({
  propertyId: uuid,
  operator: z.enum(filterOperators),
  value: filterValueSchema.optional(),
});

export type FilterRule = z.infer<typeof filterRuleSchema>;

export type FilterGroup = {
  conjunction: 'and' | 'or';
  rules: (FilterRule | FilterGroup)[];
};

function isFilterGroup(rule: FilterRule | FilterGroup): rule is FilterGroup {
  return 'conjunction' in rule;
}

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    conjunction: z.enum(['and', 'or']),
    rules: z.array(z.union([filterRuleSchema, filterGroupSchema])).max(50),
  }),
);

// ---------------------------------------------------------------------------
// Calculations (§20B.1) — 20 functions, shared by column calculations and rollup (§24B.2).

export const calculationIds = [
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

export type CalculationId = (typeof calculationIds)[number];

// ---------------------------------------------------------------------------
// View config (§21A.1)

const sortSchema = z.object({ propertyId: uuid, direction: z.enum(['asc', 'desc']) });

const propertyVisibilitySchema = z.object({
  propertyId: uuid,
  visible: z.boolean(),
  width: z.number().positive().optional(),
});

const cardPreviewSchema = z.union([
  z.literal('none'),
  z.literal('cover'),
  z.literal('content'),
  z.object({ propertyId: uuid }),
]);

const baseViewConfigSchema = z.object({
  version: z.literal(1),
  filter: filterGroupSchema.nullable().default(null),
  sorts: z.array(sortSchema).max(10).default([]),
  properties: z.array(propertyVisibilitySchema).default([]),
  calculations: z.record(z.enum(calculationIds)).default({}),
  pageSize: z.number().int().min(25).max(500).default(50),
  openAs: z.enum(['side', 'center', 'full']).default('side'),
  locked: z.boolean().default(false),
  search: z.string().default(''),
});

const tableExtraSchema = z.object({
  rowHeight: z.enum(['short', 'medium', 'tall']).default('short'),
  wrapCells: z.boolean().default(false),
  showRowNumbers: z.boolean().default(false),
  groupBy: uuid.optional(),
});

const boardExtraSchema = z.object({
  // "Wajib" per §21A.1 in the sense that a board view is created with one —
  // optional here defensively so migrateViewConfig never throws on a group's
  // property having been deleted since; the UI falls back to the first
  // available select/status property when it's missing.
  groupBy: uuid.optional(),
  subGroupBy: uuid.optional(),
  cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
  cardPreview: cardPreviewSchema.default('none'),
  colorByGroup: z.boolean().default(true),
  // Group keys with their cards hidden (Sprint 21) — `${groupOptionId}` or
  // `${groupOptionId}:${subGroupOptionId}`, `'__empty__'` for the no-status
  // column. Not pruned against live property ids like groupBy/subGroupBy —
  // an option id living inside a select/status property's own config, not a
  // property id itself, so it isn't in `liveIds` at all; a stale entry here
  // just never matches a rendered group and is harmless.
  collapsedGroups: z.array(z.string()).default([]),
});

const calendarExtraSchema = z.object({
  // See boardExtraSchema.groupBy — optional here for the same defensive reason.
  dateProperty: uuid.optional(),
  endDateProperty: uuid.optional(),
  showWeekends: z.boolean().default(true),
  span: z.enum(['month', 'week']).default('month'),
});

const galleryExtraSchema = z.object({
  cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
  cardPreview: cardPreviewSchema.default('cover'),
  fitImage: z.boolean().default(true),
});

// No fields beyond `base` (§21B.1) — visible columns are `properties[].visible` like every other view.
const listExtraSchema = z.object({});

const timelineExtraSchema = z.object({
  // Optional for the same defensive reason as boardExtraSchema.groupBy.
  startProperty: uuid.optional(),
  endProperty: uuid.optional(),
  zoom: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('week'),
  showTable: z.boolean().default(true),
});

export type ViewType = (typeof viewTypes)[number];

const viewConfigSchemas: Record<ViewType, z.ZodType> = {
  table: baseViewConfigSchema.merge(tableExtraSchema),
  board: baseViewConfigSchema.merge(boardExtraSchema),
  calendar: baseViewConfigSchema.merge(calendarExtraSchema),
  gallery: baseViewConfigSchema.merge(galleryExtraSchema),
  list: baseViewConfigSchema.merge(listExtraSchema),
  timeline: baseViewConfigSchema.merge(timelineExtraSchema),
};

/** The validated shape of `database_views.config` for a given view type. */
export function getViewConfigSchema(viewType: ViewType): z.ZodType {
  return viewConfigSchemas[viewType];
}

export type ViewConfig = z.infer<typeof baseViewConfigSchema> & Record<string, unknown>;

/** Body of `POST /databases/:id/query` (§22A.1). */
export const databaseQueryRequestSchema = z.object({
  viewId: uuid.optional(),
  // Partial<ViewConfig> — previews an unsaved filter/sort edit without a round-trip through PATCH (§22A.2).
  overrides: z.record(z.unknown()).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type DatabaseQueryRequestDto = z.infer<typeof databaseQueryRequestSchema>;

// Legacy operators from before §22A.3's vocabulary landed.
const LEGACY_OPERATOR_MAP: Record<string, FilterOperator> = {
  equals: 'is',
  not_equals: 'is_not',
};

function pruneOrphanFilter(
  group: FilterGroup | null,
  liveIds: Set<string>,
): FilterGroup | null {
  if (!group) return null;
  const rules = group.rules
    .map((rule) => (isFilterGroup(rule) ? pruneOrphanFilter(rule, liveIds) : rule))
    .filter((rule): rule is FilterRule | FilterGroup => {
      if (!rule) return false;
      if (isFilterGroup(rule)) return rule.rules.length > 0;
      return liveIds.has(rule.propertyId);
    });
  return rules.length > 0 ? { conjunction: group.conjunction, rules } : null;
}

/**
 * Reads (and writes) `database_views.config` through one gate (§21A.2, ADR-18).
 * Pure function: `switch` on `raw.version` fills defaults for anything
 * unrecognized, then strips every `propertyId` that no longer exists on the
 * database (§21A.3) — belt-and-suspenders alongside the transactional sweep
 * that runs when a property is actually deleted (§20A.5).
 */
/** Rewrites legacy operator names anywhere in a raw (unvalidated) filter tree, before schema validation runs. */
function migrateRawFilterOperators(rawFilter: unknown): unknown {
  if (!rawFilter || typeof rawFilter !== 'object') return rawFilter;
  const obj = rawFilter as Record<string, unknown>;
  if (Array.isArray(obj.rules)) {
    return { ...obj, rules: obj.rules.map(migrateRawFilterOperators) };
  }
  if (typeof obj.operator === 'string' && obj.operator in LEGACY_OPERATOR_MAP) {
    return { ...obj, operator: LEGACY_OPERATOR_MAP[obj.operator] };
  }
  return obj;
}

export function migrateViewConfig(
  raw: unknown,
  viewType: ViewType,
  properties: { id: string }[],
): ViewConfig {
  const schema = getViewConfigSchema(viewType);
  const source = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {};
  const withVersion = {
    ...source,
    version: 1,
    ...(source.filter ? { filter: migrateRawFilterOperators(source.filter) } : {}),
  };
  const parsed = schema.safeParse(withVersion);
  const config = (parsed.success ? parsed.data : schema.parse({ version: 1 })) as ViewConfig;

  const liveIds = new Set(properties.map((p) => p.id));

  const filterProperty = pruneOrphanFilter(config.filter as FilterGroup | null, liveIds);

  const sorts = (config.sorts as { propertyId: string; direction: 'asc' | 'desc' }[]).filter((s) =>
    liveIds.has(s.propertyId),
  );
  const properties_ = (config.properties as { propertyId: string; visible: boolean; width?: number }[]).filter((p) =>
    liveIds.has(p.propertyId),
  );
  const calculations = Object.fromEntries(
    Object.entries(config.calculations as Record<string, CalculationId>).filter(([propertyId]) =>
      liveIds.has(propertyId),
    ),
  );

  const result: ViewConfig = {
    ...config,
    filter: filterProperty,
    sorts,
    properties: properties_,
    calculations,
  };

  // Per-view-type fields that reference a single property by id (§21A.3).
  for (const key of ['groupBy', 'subGroupBy', 'dateProperty', 'endDateProperty', 'startProperty', 'endProperty']) {
    const value = result[key];
    if (typeof value === 'string' && !liveIds.has(value)) delete result[key];
  }

  return result;
}
