import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import {
  migrateViewConfig,
  type CalculationId,
  type FilterGroup,
  type ViewConfig,
  type ViewType,
} from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { DatabaseProperty, DatabaseRow, databaseProperties, databaseRows, databaseViews } from '../db/schema';
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
  type SortSpec,
} from './database-query.lib';

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
      properties.map((p) => [p.id, { id: p.id, type: p.type as QueryPropertyType }]),
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
    const rows = pageRows.slice(0, limit).map((row) => this.projectDerivedProperties(row, properties));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = pageRows[limit - 1];
      nextCursor = encodeCursor({
        values: sorts
          .filter((s) => propsById.has(s.propertyId))
          .map((s) => this.cursorValueFor(last, propsById.get(s.propertyId)!)),
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
    if (Object.keys(derived).length === 0) return row;
    return { ...row, values: { ...row.values, ...derived } };
  }

  private cursorValueFor(row: DatabaseRow, prop: PropertyMeta): string | number | boolean | null {
    if (prop.type === 'created_time') return row.createdAt.toISOString();
    if (prop.type === 'last_edited_time') return row.updatedAt.toISOString();
    if (prop.type === 'unique_id') return row.uniqueIdSeq ?? null;

    const value = row.values?.[prop.id];
    if (value === undefined || value === null) return null;
    if (prop.type === 'number') return typeof value === 'number' ? value : Number(value);
    if (prop.type === 'checkbox') return typeof value === 'boolean' ? value : Boolean(value);
    return typeof value === 'string' ? value : String(value);
  }
}
