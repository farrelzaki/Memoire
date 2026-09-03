import { sql, type SQL } from 'drizzle-orm';
import type { CalculationId, FilterGroup, FilterRule } from '@memoire/validation';
import { databaseRows } from '../db/schema';

export type QueryPropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'files'
  | 'created_time'
  | 'last_edited_time'
  | 'unique_id';

export type PropertyMeta = { id: string; type: QueryPropertyType };

const TEXT_TYPES = new Set<QueryPropertyType>(['title', 'text', 'url', 'email', 'phone']);
const JSONB_ARRAY_TYPES = new Set<QueryPropertyType>(['multi_select', 'files']);
const NUMERIC_TYPES = new Set<QueryPropertyType>(['number', 'unique_id']);
const DATE_TYPES = new Set<QueryPropertyType>(['date', 'created_time', 'last_edited_time']);

/**
 * `prop.id` is embedded as a raw SQL string literal, not a bind parameter —
 * deliberately. The same extraction expression is often referenced more than
 * once in one composed query (e.g. a grouped query selects the group key
 * expression AND repeats it in `GROUP BY`); Postgres assigns each bind-param
 * occurrence its own `$n`, and its GROUP BY validity check compares `Param`
 * nodes by id, not by runtime value — two `$n`s bound to the same string are
 * NOT recognized as the same expression, which fails with "column must
 * appear in the GROUP BY clause" even though the SQL text is logically
 * identical. A literal has no such identity problem. This is still
 * injection-safe: `prop.id` only ever comes from `propsById`, built from
 * `database_properties` rows already fetched for this database — never
 * spliced from request input directly — and is escaped regardless.
 */
function keyLiteral(id: string): SQL {
  return sql.raw(`'${id.replace(/'/g, "''")}'`);
}

export function extractionSql(prop: PropertyMeta): SQL {
  switch (prop.type) {
    case 'created_time':
      return sql`${databaseRows.createdAt}`;
    case 'last_edited_time':
      return sql`${databaseRows.updatedAt}`;
    case 'unique_id':
      return sql`${databaseRows.uniqueIdSeq}`;
    case 'number':
      return sql`(${databaseRows.values} ->> ${keyLiteral(prop.id)})::numeric`;
    case 'checkbox':
      return sql`(${databaseRows.values} ->> ${keyLiteral(prop.id)})::boolean`;
    case 'date':
      return sql`(${databaseRows.values} ->> ${keyLiteral(prop.id)})::timestamptz`;
    case 'multi_select':
    case 'files':
      return sql`(${databaseRows.values} -> ${keyLiteral(prop.id)})`;
    default:
      return sql`(${databaseRows.values} ->> ${keyLiteral(prop.id)})`;
  }
}

function emptySql(prop: PropertyMeta): SQL {
  const ext = extractionSql(prop);
  if (JSONB_ARRAY_TYPES.has(prop.type)) {
    return sql`(${ext} is null or jsonb_array_length(${ext}) = 0)`;
  }
  if (TEXT_TYPES.has(prop.type) || prop.type === 'select' || prop.type === 'status') {
    return sql`(${ext} is null or ${ext} = '')`;
  }
  return sql`${ext} is null`;
}

/** Day-aligned range (server-local calendar day) for a relative date token (§22A.3). */
export function resolveRelativeDateRange(
  token: string,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);

  const today = startOfDay(now);
  switch (token) {
    case 'today':
      return { start: today, end: addDays(today, 1) };
    case 'tomorrow':
      return { start: addDays(today, 1), end: addDays(today, 2) };
    case 'yesterday':
      return { start: addDays(today, -1), end: today };
    case 'this_week':
      return { start: startOfWeek(today), end: addDays(startOfWeek(today), 7) };
    case 'past_week':
      return { start: addDays(startOfWeek(today), -7), end: startOfWeek(today) };
    case 'next_week':
      return { start: addDays(startOfWeek(today), 7), end: addDays(startOfWeek(today), 14) };
    case 'past_month': {
      const start = new Date(startOfMonth(today));
      start.setMonth(start.getMonth() - 1);
      return { start, end: startOfMonth(today) };
    }
    case 'next_month': {
      const start = startOfMonth(today);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 2);
      const nextStart = new Date(start);
      nextStart.setMonth(nextStart.getMonth() + 1);
      return { start: nextStart, end };
    }
    case 'past_year': {
      const start = new Date(startOfYear(today));
      start.setFullYear(start.getFullYear() - 1);
      return { start, end: startOfYear(today) };
    }
    case 'next_year': {
      const start = startOfYear(today);
      const nextStart = new Date(start);
      nextStart.setFullYear(nextStart.getFullYear() + 1);
      const end = new Date(nextStart);
      end.setFullYear(end.getFullYear() + 1);
      return { start: nextStart, end };
    }
    default:
      return null;
  }
}

function dateValueRange(value: unknown): { start: Date; end: Date } | null {
  if (typeof value === 'string') {
    const relative = resolveRelativeDateRange(value);
    if (relative) return relative;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const start = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  return null;
}

function dateRuleSql(ext: SQL, operator: string, value: unknown): SQL | null {
  const range = dateValueRange(value);
  if (!range) return null;
  switch (operator) {
    case 'is':
    case 'is_within':
      return sql`(${ext} >= ${range.start} and ${ext} < ${range.end})`;
    case 'is_before':
      return sql`${ext} < ${range.start}`;
    case 'is_after':
      return sql`${ext} >= ${range.end}`;
    case 'is_on_or_before':
      return sql`${ext} < ${range.end}`;
    case 'is_on_or_after':
      return sql`${ext} >= ${range.start}`;
    default:
      return null;
  }
}

function isFilterGroup(rule: FilterRule | FilterGroup): rule is FilterGroup {
  return 'conjunction' in rule;
}

/** One filter rule → one boolean SQL expression. `null` if the rule can't be evaluated (unknown property/operator/value combo) — dropped, never thrown, so one bad rule can't 500 the whole query. */
export function buildRuleSql(rule: FilterRule, propsById: Map<string, PropertyMeta>): SQL | null {
  const prop = propsById.get(rule.propertyId);
  if (!prop) return null;
  const ext = extractionSql(prop);
  const { operator, value } = rule;

  if (operator === 'is_empty') return emptySql(prop);
  if (operator === 'is_not_empty') return sql`not ${emptySql(prop)}`;

  if (DATE_TYPES.has(prop.type)) {
    return dateRuleSql(ext, operator, value);
  }

  if (NUMERIC_TYPES.has(prop.type)) {
    if (typeof value !== 'number') return null;
    switch (operator) {
      case '=':
        return sql`${ext} = ${value}`;
      case '!=':
        return sql`${ext} != ${value}`;
      case '>':
        return sql`${ext} > ${value}`;
      case '<':
        return sql`${ext} < ${value}`;
      case '>=':
        return sql`${ext} >= ${value}`;
      case '<=':
        return sql`${ext} <= ${value}`;
      default:
        return null;
    }
  }

  if (prop.type === 'checkbox') {
    return operator === 'is' && typeof value === 'boolean' ? sql`${ext} = ${value}` : null;
  }

  if (JSONB_ARRAY_TYPES.has(prop.type)) {
    if (typeof value !== 'string') return null;
    switch (operator) {
      case 'contains':
        return sql`${ext} @> ${JSON.stringify([value])}`;
      case 'does_not_contain':
        return sql`not (${ext} @> ${JSON.stringify([value])})`;
      default:
        return null;
    }
  }

  if (prop.type === 'select' || prop.type === 'status') {
    switch (operator) {
      case 'is':
        return typeof value === 'string' ? sql`${ext} = ${value}` : null;
      case 'is_not':
        return typeof value === 'string' ? sql`(${ext} is distinct from ${value})` : null;
      case 'is_any_of':
        return Array.isArray(value) ? sql`${ext} = any(${value.map(String)})` : null;
      case 'is_none_of':
        return Array.isArray(value) ? sql`not (${ext} = any(${value.map(String)}))` : null;
      default:
        return null;
    }
  }

  // text-like: title, text, url, email, phone
  if (TEXT_TYPES.has(prop.type) && typeof value === 'string') {
    switch (operator) {
      case 'is':
        return sql`${ext} = ${value}`;
      case 'is_not':
        return sql`(${ext} is distinct from ${value})`;
      case 'contains':
        return sql`${ext} ilike ${'%' + escapeLike(value) + '%'}`;
      case 'does_not_contain':
        return sql`(coalesce(${ext}, '') not ilike ${'%' + escapeLike(value) + '%'})`;
      case 'starts_with':
        return sql`${ext} ilike ${escapeLike(value) + '%'}`;
      case 'ends_with':
        return sql`${ext} ilike ${'%' + escapeLike(value)}`;
      default:
        return null;
    }
  }

  return null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Recursively builds a `WHERE`-ready boolean expression from a filter group (§22A.4). */
export function buildFilterSql(
  group: FilterGroup | null | undefined,
  propsById: Map<string, PropertyMeta>,
): SQL | undefined {
  if (!group) return undefined;

  const parts = group.rules
    .map((rule) => (isFilterGroup(rule) ? buildFilterSql(rule, propsById) : buildRuleSql(rule, propsById)))
    .filter((part): part is SQL => part !== undefined && part !== null);

  if (parts.length === 0) return undefined;

  const joiner = group.conjunction === 'or' ? sql` or ` : sql` and `;
  const joined = parts.reduce((acc, part, i) => (i === 0 ? sql`${part}` : sql`${acc}${joiner}${part}`), sql``);
  return sql`(${joined})`;
}

export type SortSpec = { propertyId: string; direction: 'asc' | 'desc' };

/** `ORDER BY` expressions for multi-sort, always tie-broken by `id` for stable keyset pagination (§22A.6). */
export function buildSortSql(sorts: SortSpec[], propsById: Map<string, PropertyMeta>): SQL[] {
  const clauses: SQL[] = [];
  for (const sort of sorts) {
    const prop = propsById.get(sort.propertyId);
    if (!prop) continue;
    const ext = extractionSql(prop);
    clauses.push(sort.direction === 'desc' ? sql`${ext} desc nulls last` : sql`${ext} asc nulls last`);
  }
  clauses.push(sql`${databaseRows.id} asc`);
  return clauses;
}

export type Cursor = { values: (string | number | boolean | null)[]; id: string };

/** Opaque keyset cursor (§22A.6) — never `OFFSET`, so inserts mid-scroll can't shift or duplicate a page. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed && Array.isArray(parsed.values) && typeof parsed.id === 'string') return parsed as Cursor;
    return null;
  } catch {
    return null;
  }
}

/**
 * Keyset `WHERE` predicate for multi-column sort + `id` tiebreak (§22A.6):
 * `(s0 > c0) OR (s0 = c0 AND s1 > c1) OR ... OR (s0=c0 AND ... AND id > cId)`,
 * with `>`/`<` flipped per sort direction. A cursor value of `null` (the
 * previous page's last row had an empty sort property) degrades to skipping
 * the equality branch for that column — an accepted edge case at the
 * personal-database scale this engine targets (§22A.5), not a correctness
 * guarantee for every possible NULL pattern.
 */
export function buildKeysetSql(
  sorts: SortSpec[],
  propsById: Map<string, PropertyMeta>,
  cursor: Cursor,
): SQL | undefined {
  const known = sorts.filter((s) => propsById.has(s.propertyId));
  if (cursor.values.length !== known.length) return undefined;

  const branches: SQL[] = [];
  for (let i = 0; i <= known.length; i += 1) {
    const eqParts: SQL[] = [];
    for (let j = 0; j < i; j += 1) {
      const ext = extractionSql(propsById.get(known[j].propertyId)!);
      const val = cursor.values[j];
      eqParts.push(val === null ? sql`${ext} is null` : sql`${ext} = ${val}`);
    }

    let tail: SQL;
    if (i < known.length) {
      const sort = known[i];
      const ext = extractionSql(propsById.get(sort.propertyId)!);
      const val = cursor.values[i];
      if (val === null) continue; // can't express "> null"; skip this branch
      tail = sort.direction === 'desc' ? sql`${ext} < ${val}` : sql`${ext} > ${val}`;
    } else {
      tail = sql`${databaseRows.id} > ${cursor.id}`;
    }

    branches.push(eqParts.length > 0 ? sql`(${sqlAnd([...eqParts, tail])})` : sql`(${tail})`);
  }

  return branches.length > 0 ? sql`(${sqlOr(branches)})` : undefined;
}

function sqlAnd(parts: SQL[]): SQL {
  return parts.reduce((acc, part, i) => (i === 0 ? part : sql`${acc} and ${part}`));
}

function sqlOr(parts: SQL[]): SQL {
  return parts.reduce((acc, part, i) => (i === 0 ? part : sql`${acc} or ${part}`));
}

export type CalculationRequest = { propertyId: string; calculationId: CalculationId };
export type CalculationResultExpr = { propertyId: string; calculationId: CalculationId; expr: SQL };

/**
 * One aggregate SQL expression per requested `{propertyId, calculationId}`
 * (§20B.1). Silently omitted (not an error) when the function doesn't apply
 * to the property's type — mirrors `PropertyTypeRegistry.calculations`
 * gating which functions are even offered client-side for that column.
 */
export function buildCalculationSql(
  requests: CalculationRequest[],
  propsById: Map<string, PropertyMeta>,
): CalculationResultExpr[] {
  const results: CalculationResultExpr[] = [];

  for (const { propertyId, calculationId } of requests) {
    const prop = propsById.get(propertyId);
    if (!prop) continue;
    const ext = extractionSql(prop);
    const empty = emptySql(prop);
    const expr = calculationExpr(calculationId, prop, ext, empty);
    if (expr) results.push({ propertyId, calculationId, expr });
  }

  return results;
}

function calculationExpr(id: CalculationId, prop: PropertyMeta, ext: SQL, empty: SQL): SQL | null {
  switch (id) {
    case 'count_all':
      return sql`count(*)`;
    case 'count_values':
      return sql`count(*) filter (where not ${empty})`;
    case 'count_unique':
      return sql`count(distinct ${ext})`;
    case 'count_empty':
      return sql`count(*) filter (where ${empty})`;
    case 'count_not_empty':
      return sql`count(*) filter (where not ${empty})`;
    case 'percent_empty':
      return sql`(count(*) filter (where ${empty}))::float / greatest(count(*), 1) * 100`;
    case 'percent_not_empty':
      return sql`(count(*) filter (where not ${empty}))::float / greatest(count(*), 1) * 100`;
    default:
      break;
  }

  if (NUMERIC_TYPES.has(prop.type)) {
    switch (id) {
      case 'sum':
        return sql`sum(${ext})`;
      case 'average':
        return sql`avg(${ext})`;
      case 'median':
        return sql`percentile_cont(0.5) within group (order by ${ext})`;
      case 'min':
        return sql`min(${ext})`;
      case 'max':
        return sql`max(${ext})`;
      case 'range':
        return sql`max(${ext}) - min(${ext})`;
      default:
        return null;
    }
  }

  if (DATE_TYPES.has(prop.type)) {
    switch (id) {
      case 'earliest_date':
        return sql`min(${ext})`;
      case 'latest_date':
        return sql`max(${ext})`;
      case 'date_range':
        return sql`extract(epoch from (max(${ext}) - min(${ext}))) / 86400`;
      default:
        return null;
    }
  }

  if (prop.type === 'checkbox') {
    switch (id) {
      case 'checked':
        return sql`count(*) filter (where ${ext} is true)`;
      case 'unchecked':
        return sql`count(*) filter (where ${ext} is not true)`;
      case 'percent_checked':
        return sql`(count(*) filter (where ${ext} is true))::float / greatest(count(*), 1) * 100`;
      case 'percent_unchecked':
        return sql`(count(*) filter (where ${ext} is not true))::float / greatest(count(*), 1) * 100`;
      default:
        return null;
    }
  }

  return null;
}
