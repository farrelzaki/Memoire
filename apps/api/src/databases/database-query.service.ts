import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  migrateViewConfig,
  type CalculationId,
  type FilterGroup,
  type FormulaConfig,
  type RollupConfig,
  type ViewConfig,
  type ViewType,
} from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import {
  DatabaseProperty,
  DatabaseRow,
  databaseProperties,
  databaseRelationLinks,
  databaseRows,
  databaseViews,
} from '../db/schema';
import {
  buildCalculationSql,
  buildFilterSql,
  buildKeysetSql,
  buildSortSql,
  decodeCursor,
  encodeCursor,
  extractionSql,
  type CalculationRequest,
  type PropertyMeta,
  type QueryPropertyType,
  type QueryValueKind,
  type SortSpec,
} from './database-query.lib';

/** Every rollup function except these two collapses to a plain number (§53) — mirrors `@memoire/formula`'s `aggregate()`, the JS-side implementation that actually produces these values. */
export function rollupValueKind(fn: unknown): QueryValueKind {
  if (fn === 'earliest_date' || fn === 'latest_date') return 'date';
  if (fn === 'show_original') return 'unknown';
  return 'number';
}

export function valueKindOf(property: DatabaseProperty): QueryValueKind | undefined {
  if (property.type === 'formula') return (property.config as FormulaConfig | null)?.returnType;
  if (property.type === 'rollup') return rollupValueKind((property.config as RollupConfig | null)?.function);
  return undefined;
}

export type DatabaseQueryInput = {
  viewId?: string;
  overrides?: Record<string, unknown>;
  cursor?: string;
  limit?: number;
};

export type DatabaseQueryGroup = {
  key: string | null;
  count: number;
  calculations: Record<string, unknown>;
};

export type DatabaseQueryResult = {
  rows: DatabaseRow[];
  groups: DatabaseQueryGroup[] | null;
  calculations: Record<string, unknown>;
  total: number;
  nextCursor: string | null;
  computedAt: string;
};

/**
 * `POST /databases/:id/query` (§22A) — the one path that reads rows. Filter,
 * sort, group, and aggregation all run in SQL over the full filtered set;
 * pagination is keyset, never `OFFSET` (§22A.6). Writes stay plain REST
 * (`POST /database-rows`, `PATCH /database-rows/:id`) in `DatabasesService`.
 */
@Injectable()
export class DatabaseQueryService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  async query(databaseId: string, input: DatabaseQueryInput): Promise<DatabaseQueryResult> {
    const properties = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId))
      .orderBy(asc(databaseProperties.position));

    const propsById = new Map<string, PropertyMeta>(
      properties.map((p) => [p.id, { id: p.id, type: p.type as QueryPropertyType, valueKind: valueKindOf(p) }]),
    );

    const view = await this.resolveView(databaseId, input.viewId);
    const migrated = migrateViewConfig(view.config, view.type as ViewType, properties);
    const config = { ...migrated, ...(input.overrides ?? {}) } as ViewConfig;

    const limit = input.limit ?? config.pageSize ?? 50;
    const sorts = (config.sorts ?? []) as SortSpec[];
    const groupByPropertyId = typeof config.groupBy === 'string' ? config.groupBy : undefined;
    const groupByProp = groupByPropertyId ? propsById.get(groupByPropertyId) : undefined;

    const filterSql = buildFilterSql(config.filter as FilterGroup | null, propsById);
    const baseWhere = and(eq(databaseRows.databaseId, databaseId), filterSql);

    const [{ count: total }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(databaseRows)
      .where(baseWhere);

    const calcRequests: CalculationRequest[] = Object.entries(
      (config.calculations ?? {}) as Record<string, CalculationId>,
    ).map(([propertyId, calculationId]) => ({ propertyId, calculationId }));

    const calculations = await this.runCalculations(baseWhere, calcRequests, propsById);
    const groups = groupByProp ? await this.runGroups(baseWhere, groupByProp, calcRequests, propsById) : null;

    const orderBy = groupByProp
      ? [extractionSql(groupByProp), ...buildSortSql(sorts, propsById)]
      : buildSortSql(sorts, propsById);

    let pageWhere = baseWhere;
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      if (cursor) {
        const keyset = buildKeysetSql(sorts, propsById, cursor);
        if (keyset) pageWhere = and(baseWhere, keyset);
      }
    }

    const pageRows = await this.db
      .select()
      .from(databaseRows)
      .where(pageWhere)
      .orderBy(...orderBy)
      .limit(limit + 1);

    const hasMore = pageRows.length > limit;
    const pageOfRows = pageRows.slice(0, limit).map((row) => this.projectDerivedProperties(row, properties));
    const rows = await this.projectRelations(pageOfRows, properties);

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = pageRows[limit - 1];
      const sortableSorts = sorts.filter((s) => {
        const prop = propsById.get(s.propertyId);
        return prop !== undefined && prop.type !== 'relation'; // relation has no natural order (§53)
      });
      nextCursor = encodeCursor({
        values: sortableSorts.map((s) => this.cursorValueFor(last, propsById.get(s.propertyId)!)),
        id: last.id,
      });
    }

    return { rows, groups, calculations, total, nextCursor, computedAt: new Date().toISOString() };
  }

  private async resolveView(databaseId: string, viewId?: string) {
    if (viewId) {
      const [view] = await this.db.select().from(databaseViews).where(eq(databaseViews.id, viewId));
      if (!view) throw new NotFoundException(`View ${viewId} not found`);
      return view;
    }
    const [view] = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, databaseId))
      .orderBy(asc(databaseViews.position))
      .limit(1);
    if (!view) throw new NotFoundException(`Database ${databaseId} has no views`);
    return view;
  }

  private async runCalculations(
    where: SQL | undefined,
    requests: CalculationRequest[],
    propsById: Map<string, PropertyMeta>,
  ): Promise<Record<string, unknown>> {
    const exprs = buildCalculationSql(requests, propsById);
    if (exprs.length === 0) return {};

    const selection: Record<string, SQL> = {};
    for (const e of exprs) selection[e.propertyId] = e.expr;

    const [row] = await this.db.select(selection).from(databaseRows).where(where);
    return row ?? {};
  }

  private async runGroups(
    where: SQL | undefined,
    groupByProp: PropertyMeta,
    calcRequests: CalculationRequest[],
    propsById: Map<string, PropertyMeta>,
  ): Promise<DatabaseQueryGroup[]> {
    const groupExt = extractionSql(groupByProp);
    const calcExprs = buildCalculationSql(calcRequests, propsById);

    const selection: Record<string, SQL> = { key: sql`${groupExt}`, count: sql<number>`count(*)::int` };
    for (const e of calcExprs) selection[`calc_${e.propertyId}`] = e.expr;

    const rows = await this.db.select(selection).from(databaseRows).where(where).groupBy(groupExt);

    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        key: (record.key as string | null) ?? null,
        count: record.count as number,
        calculations: Object.fromEntries(calcExprs.map((e) => [e.propertyId, record[`calc_${e.propertyId}`]])),
      };
    });
  }

  /** Response-only synthesis of derived properties (§20A.4) — never written back to `values`. */
  private projectDerivedProperties(row: DatabaseRow, properties: DatabaseProperty[]): DatabaseRow {
    const derived: Record<string, unknown> = {};
    for (const p of properties) {
      if (p.type === 'created_time') derived[p.id] = row.createdAt.toISOString();
      else if (p.type === 'last_edited_time') derived[p.id] = row.updatedAt.toISOString();
      else if (p.type === 'unique_id') derived[p.id] = row.uniqueIdSeq;
    }
    // formula/rollup need no synthesis — already materialized in `row.computed`
    // by `FormulaRecomputeService` (§24A, §24B); the client reads them from there.
    if (Object.keys(derived).length === 0) return row;
    return { ...row, values: { ...row.values, ...derived } };
  }

  /**
   * One batched query for every `relation` property × every row on this
   * page — `values[relationPropertyId] = toRowId[]`, avoiding an N+1 over
   * `database_relation_links` (§53). `values` never stores relation data at
   * rest (§23A.1); this is a response-only projection, same as
   * `projectDerivedProperties`.
   */
  private async projectRelations(rows: DatabaseRow[], properties: DatabaseProperty[]): Promise<DatabaseRow[]> {
    const relationPropertyIds = properties.filter((p) => p.type === 'relation').map((p) => p.id);
    if (relationPropertyIds.length === 0 || rows.length === 0) return rows;

    const links = await this.db
      .select({
        propertyId: databaseRelationLinks.propertyId,
        fromRowId: databaseRelationLinks.fromRowId,
        toRowId: databaseRelationLinks.toRowId,
      })
      .from(databaseRelationLinks)
      .where(
        and(
          inArray(
            databaseRelationLinks.fromRowId,
            rows.map((r) => r.id),
          ),
          inArray(databaseRelationLinks.propertyId, relationPropertyIds),
        ),
      );

    const byRow = new Map<string, Record<string, string[]>>();
    for (const link of links) {
      const entry = byRow.get(link.fromRowId) ?? {};
      (entry[link.propertyId] ??= []).push(link.toRowId);
      byRow.set(link.fromRowId, entry);
    }

    return rows.map((row) => {
      const relationValues = byRow.get(row.id);
      return relationValues ? { ...row, values: { ...row.values, ...relationValues } } : row;
    });
  }

  private cursorValueFor(row: DatabaseRow, prop: PropertyMeta): string | number | boolean | null {
    if (prop.type === 'created_time') return row.createdAt.toISOString();
    if (prop.type === 'last_edited_time') return row.updatedAt.toISOString();
    if (prop.type === 'unique_id') return row.uniqueIdSeq ?? null;

    if (prop.type === 'formula' || prop.type === 'rollup') {
      const value = row.computed?.[prop.id];
      if (value === undefined || value === null) return null;
      if (prop.valueKind === 'number') return typeof value === 'number' ? value : Number(value);
      if (prop.valueKind === 'boolean') return typeof value === 'boolean' ? value : Boolean(value);
      return typeof value === 'string' ? value : String(value);
    }

    const value = row.values?.[prop.id];
    if (value === undefined || value === null) return null;
    if (prop.type === 'number') return typeof value === 'number' ? value : Number(value);
    if (prop.type === 'checkbox') return typeof value === 'boolean' ? value : Boolean(value);
    return typeof value === 'string' ? value : String(value);
  }
}
