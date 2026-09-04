import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { aggregate, evaluate, type FormulaAst } from '@memoire/formula';
import type { FormulaConfig, RollupConfig } from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import {
  DatabaseProperty,
  DatabaseRow,
  databaseProperties,
  databaseRelationLinks,
  databaseRows,
} from '../db/schema';
import { FormulaGraphService } from './formula-graph.service';

const CHUNK_SIZE = 500;

/**
 * Evaluates formula/rollup properties and materializes them into
 * `database_rows.computed` (§24A.5, §24B.3-4). Reads are always from
 * `computed` (`database-query.service.ts`) — this is the only writer.
 */
@Injectable()
export class FormulaRecomputeService {
  private readonly logger = new Logger(FormulaRecomputeService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly graph: FormulaGraphService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /** Recomputes every formula/rollup property for one row, in dependency order, inside the caller's transaction. */
  async recomputeRow(
    tx: DrizzleTx,
    databaseId: string,
    row: DatabaseRow,
    properties: DatabaseProperty[],
  ): Promise<DatabaseRow> {
    const order = await this.graph.topoOrder(databaseId);
    const byId = new Map(properties.map((p) => [p.id, p]));
    const computed: Record<string, unknown> = { ...row.computed };
    const now = new Date();

    for (const propertyId of order) {
      const property = byId.get(propertyId);
      if (!property) continue; // property since deleted; graph will be invalidated separately

      if (property.type === 'formula') {
        const config = property.config as FormulaConfig | null;
        if (!config?.ast) continue;
        // Volatile (now()/today()) formulas are never materialized (§24A.3)
        // — their value depends on the clock, not row data, so they're
        // evaluated at read time instead. Drop any stale value left over
        // from before the formula was edited to become volatile.
        if (config.volatile) {
          delete computed[propertyId];
          continue;
        }
        const result = evaluate(config.ast as FormulaAst, {
          values: { ...row.values, ...computed },
          now,
        });
        computed[propertyId] = result.error ? { error: result.error } : result.value;
      } else if (property.type === 'rollup') {
        computed[propertyId] = await this.computeRollup(tx, row.id, property.config as RollupConfig | null);
      }
    }

    const [updated] = await tx
      .update(databaseRows)
      .set({ computed, computedAt: now })
      .where(eq(databaseRows.id, row.id))
      .returning();
    return updated;
  }

  private async computeRollup(tx: DrizzleTx, rowId: string, config: RollupConfig | null): Promise<unknown> {
    if (!config) return null;

    const links = await tx
      .select({ toRowId: databaseRelationLinks.toRowId })
      .from(databaseRelationLinks)
      .where(and(eq(databaseRelationLinks.propertyId, config.relationPropertyId), eq(databaseRelationLinks.fromRowId, rowId)));

    if (links.length === 0) return aggregate(config.function, []);

    const relatedRows = await tx
      .select()
      .from(databaseRows)
      .where(inArray(databaseRows.id, links.map((l) => l.toRowId)));

    const targetValues = relatedRows.map(
      (r) => r.computed?.[config.targetPropertyId] ?? r.values?.[config.targetPropertyId] ?? null,
    );
    return aggregate(config.function, targetValues);
  }

  /**
   * Recomputes the rows on the *other* side of a relation link when this
   * row changes (§24A.5 case 3, §24B.4) — 1 hop only. `relationPropertyIds`
   * are the relation properties on OTHER databases whose links point at
   * `changedRowId` (i.e. this row is their target).
   */
  async recomputeDependents(tx: DrizzleTx, changedRowId: string, relationPropertyIds: string[]): Promise<void> {
    if (relationPropertyIds.length === 0) return;

    const links = await tx
      .select({ fromRowId: databaseRelationLinks.fromRowId })
      .from(databaseRelationLinks)
      .where(and(eq(databaseRelationLinks.toRowId, changedRowId), inArray(databaseRelationLinks.propertyId, relationPropertyIds)));

    const dependentRowIds = [...new Set(links.map((l) => l.fromRowId))];
    if (dependentRowIds.length === 0) return;

    const dependentRows = await tx.select().from(databaseRows).where(inArray(databaseRows.id, dependentRowIds));
    const databaseIds = [...new Set(dependentRows.map((r) => r.databaseId))];
    const propertiesByDb = new Map<string, DatabaseProperty[]>();
    for (const dbId of databaseIds) {
      propertiesByDb.set(
        dbId,
        await tx.select().from(databaseProperties).where(eq(databaseProperties.databaseId, dbId)),
      );
    }

    for (const dependentRow of dependentRows) {
      await this.recomputeRow(tx, dependentRow.databaseId, dependentRow, propertiesByDb.get(dependentRow.databaseId) ?? []);
    }
  }

  /**
   * One-shot job (§24A.5 case 2) scheduled via `@nestjs/schedule`'s
   * `SchedulerRegistry`, not awaited by the caller — the triggering HTTP
   * request (a formula/rollup property's config change) returns immediately.
   * Each chunk of 500 rows runs in its own transaction with a `setImmediate`
   * yield in between, so a large database doesn't hold one long transaction
   * or block the event loop.
   */
  recomputeDatabaseAsync(databaseId: string): void {
    const name = `formula-recompute-${databaseId}-${randomUUID()}`;
    const timeout = setTimeout(() => {
      this.scheduler.deleteTimeout(name);
      this.runDatabaseRecompute(databaseId).catch((err) => {
        this.logger.error(`Recompute failed for database ${databaseId}: ${err instanceof Error ? err.message : err}`);
      });
    }, 0);
    this.scheduler.addTimeout(name, timeout);
  }

  private async runDatabaseRecompute(databaseId: string): Promise<void> {
    const properties = await this.db.select().from(databaseProperties).where(eq(databaseProperties.databaseId, databaseId));
    if (!properties.some((p) => p.type === 'formula' || p.type === 'rollup')) return;

    let cursor: string | null = null;
    for (;;) {
      const rows: DatabaseRow[] = await this.db
        .select()
        .from(databaseRows)
        .where(
          cursor
            ? and(eq(databaseRows.databaseId, databaseId), sql`${databaseRows.id} > ${cursor}`)
            : eq(databaseRows.databaseId, databaseId),
        )
        .orderBy(databaseRows.id)
        .limit(CHUNK_SIZE);

      if (rows.length === 0) break;

      await this.db.transaction(async (tx) => {
        for (const row of rows) {
          await this.recomputeRow(tx, databaseId, row, properties);
        }
      });

      cursor = rows[rows.length - 1].id;
      if (rows.length < CHUNK_SIZE) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}
