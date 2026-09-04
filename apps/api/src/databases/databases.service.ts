import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  FormulaSyntaxError,
  isVolatile,
  parseFormula,
  referencedPropertyIds,
  type FormulaAst,
} from '@memoire/formula';
import { migrateViewConfig, type FormulaConfig, type RelationConfig, type ViewType } from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { remapRowValues, remapViewConfig } from './duplicate.lib';
import { FormulaGraphService } from './formula-graph.service';
import { FormulaRecomputeService } from './formula-recompute.service';
import {
  Database,
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
  databases,
  databaseProperties,
  databaseRelationLinks,
  databaseRows,
  databaseViews,
  pages,
  templates,
} from '../db/schema';

export interface DatabaseAggregate {
  database: Database;
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  views: DatabaseView[];
}

@Injectable()
export class DatabasesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly workspacesService: WorkspacesService,
    private readonly formulaGraph: FormulaGraphService,
    private readonly formulaRecompute: FormulaRecomputeService,
  ) {}

  /**
   * Default content for a `database` page (§11A createDefaultContent) — a
   * full-page, non-inline database. Shares the starter-content logic with
   * `create()` below (§20C), which also serves inline databases created from
   * an editor block.
   */
  async createDefault(pageId: string, name: string): Promise<Database> {
    return this.create({ ownerPageId: pageId, name, isInline: false });
  }

  /** Creates a database (page-backed or inline, §20C) with starter properties + a Table view. */
  async create(data: {
    id?: string;
    ownerPageId: string;
    name: string;
    isInline: boolean;
  }): Promise<Database> {
    const workspace = await this.workspacesService.getOrCreateDefault();

    return this.db.transaction(async (tx) => {
      const [database] = await tx
        .insert(databases)
        .values({
          ...(data.id ? { id: data.id } : {}),
          workspaceId: workspace.id,
          ownerPageId: data.ownerPageId,
          isInline: data.isInline,
          name: data.name,
        })
        .returning();

      await tx.insert(databaseProperties).values([
        { databaseId: database.id, name: 'Title', type: 'title', position: 0 },
        { databaseId: database.id, name: 'Text', type: 'text', position: 1 },
      ]);
      await tx
        .insert(databaseViews)
        .values([{ databaseId: database.id, name: 'Table', type: 'table', position: 0 }]);

      return database;
    });
  }

  async findById(id: string): Promise<Database> {
    const [database] = await this.db.select().from(databases).where(eq(databases.id, id));
    if (!database) throw new NotFoundException(`Database ${id} not found`);
    return database;
  }

  /** Id/name/owner listing for the linked-view picker (§20C.3) — no properties/rows/views. */
  async listAll(): Promise<Database[]> {
    return this.db.select().from(databases).orderBy(asc(databases.name));
  }

  /**
   * Copy the database behind `sourcePageId` onto `targetPageId` — properties,
   * views, and rows included. Runs inside the caller's transaction so
   * duplicating a database page is all-or-nothing (§7).
   *
   * Row `values` are keyed by property id, so they are remapped onto the new
   * property ids rather than copied verbatim. Each row gets its own fresh row
   * page (§20D.2), mirroring `createRow` — `PagesService.copyPageTree` skips
   * row-page children so this is the only place that creates them here.
   */
  async duplicateForPage(
    sourcePageId: string,
    targetPageId: string,
    tx: DrizzleTx,
  ): Promise<void> {
    const [source] = await tx
      .select()
      .from(databases)
      .where(and(eq(databases.ownerPageId, sourcePageId), eq(databases.isInline, false)));
    if (!source) return;

    const [target] = await tx.select().from(pages).where(eq(pages.id, targetPageId));

    // A duplicated database page is never inline — inline-ness follows the
    // block that embeds it, and this path only ever duplicates a full page.
    const [copy] = await tx
      .insert(databases)
      .values({ workspaceId: source.workspaceId, ownerPageId: targetPageId, isInline: false, name: source.name })
      .returning();

    const properties = await tx
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, source.id))
      .orderBy(asc(databaseProperties.position));

    const propertyIdMap = new Map<string, string>();
    for (const property of properties) {
      const [created] = await tx
        .insert(databaseProperties)
        .values({
          databaseId: copy.id,
          name: property.name,
          type: property.type,
          position: property.position,
          config: property.config,
        })
        .returning();
      propertyIdMap.set(property.id, created.id);
    }
    const titlePropertyId = properties.find((p) => p.type === 'title')?.id;
    const newTitlePropertyId = titlePropertyId ? propertyIdMap.get(titlePropertyId) : undefined;

    const views = await tx
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, source.id))
      .orderBy(asc(databaseViews.position));
    for (const view of views) {
      await tx.insert(databaseViews).values({
        databaseId: copy.id,
        name: view.name,
        type: view.type,
        position: view.position,
        config: remapViewConfig(view.config, propertyIdMap),
      });
    }

    const rows = await tx
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, source.id))
      .orderBy(asc(databaseRows.position));
    for (const row of rows) {
      const newValues = remapRowValues(row.values, propertyIdMap);
      const [newRow] = await tx
        .insert(databaseRows)
        .values({
          databaseId: copy.id,
          position: row.position,
          values: newValues,
          uniqueIdSeq: row.uniqueIdSeq,
          isArchived: row.isArchived,
        })
        .returning();

      const title = newTitlePropertyId ? newValues?.[newTitlePropertyId] : undefined;
      const [rowPage] = await tx
        .insert(pages)
        .values({
          workspaceId: target?.workspaceId ?? source.workspaceId,
          parentPageId: targetPageId,
          databaseId: copy.id,
          title: typeof title === 'string' && title.length > 0 ? title : 'Untitled',
          isArchived: row.isArchived,
        })
        .returning();
      await tx.update(databaseRows).set({ pageId: rowPage.id }).where(eq(databaseRows.id, newRow.id));
    }
  }

  async getByPage(pageId: string): Promise<DatabaseAggregate> {
    const [database] = await this.db
      .select()
      .from(databases)
      .where(and(eq(databases.ownerPageId, pageId), eq(databases.isInline, false)));
    if (!database) throw new NotFoundException(`Database for page ${pageId} not found`);
    return this.aggregate(database);
  }

  async getById(id: string): Promise<DatabaseAggregate> {
    return this.aggregate(await this.findById(id));
  }

  private async aggregate(database: Database): Promise<DatabaseAggregate> {
    const properties = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, database.id))
      .orderBy(asc(databaseProperties.position));
    const rows = await this.db
      .select()
      .from(databaseRows)
      .where(and(eq(databaseRows.databaseId, database.id), eq(databaseRows.isArchived, false)))
      .orderBy(asc(databaseRows.position));
    const views = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, database.id))
      .orderBy(asc(databaseViews.position));

    return { database, properties, rows, views };
  }

  async createProperty(databaseId: string, data: {
    id?: string;
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }): Promise<DatabaseProperty> {
    await this.ensureDatabase(databaseId);
    const id = data.id ?? randomUUID();

    let config: Record<string, unknown> | null = data.config ?? null;
    if (data.type === 'formula') {
      config = await this.buildFormulaConfig(databaseId, id, data.name, data.config);
    } else if (data.type === 'rollup') {
      await this.validateRollupConfig(databaseId, data.config);
    }

    const position = await this.nextPropertyPosition(databaseId);
    const [property] = await this.db
      .insert(databaseProperties)
      .values({ id, databaseId, name: data.name, type: data.type, config, position })
      .returning();

    this.formulaGraph.invalidate(databaseId);
    if (data.type === 'formula' || data.type === 'rollup') {
      this.formulaRecompute.recomputeDatabaseAsync(databaseId);
    }
    return property;
  }

  async updateProperty(id: string, data: {
    name?: string;
    config?: Record<string, unknown>;
  }): Promise<DatabaseProperty> {
    const existing = await this.ensureProperty(id);

    if (existing.type === 'relation' && data.config !== undefined) {
      return this.updateRelationProperty(existing, data.name, data.config);
    }

    let config = data.config;
    if (config !== undefined) {
      if (existing.type === 'formula') {
        config = await this.buildFormulaConfig(existing.databaseId, id, data.name ?? existing.name, config);
      } else if (existing.type === 'rollup') {
        await this.validateRollupConfig(existing.databaseId, config);
      }
    }

    const [property] = await this.db
      .update(databaseProperties)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(config !== undefined ? { config } : {}),
      })
      .where(eq(databaseProperties.id, id))
      .returning();

    this.formulaGraph.invalidate(existing.databaseId);
    if ((existing.type === 'formula' || existing.type === 'rollup') && config !== undefined) {
      this.formulaRecompute.recomputeDatabaseAsync(existing.databaseId);
    }
    return property;
  }

  /**
   * Turning a relation two-way creates the paired property on the target
   * database (`config.inversePropertyId` set on both sides); turning it back
   * one-way removes that pair and its links. Both writes happen in one
   * transaction — "tidak mungkin ada keadaan setengah tertaut" (§23A.2). The
   * client signals the toggle with a `twoWay` flag in the config payload
   * (not part of the persisted shape — `relationConfigSchema` only knows
   * `inversePropertyId`, which the server alone can resolve).
   */
  private async updateRelationProperty(
    existing: DatabaseProperty,
    name: string | undefined,
    rawConfig: Record<string, unknown>,
  ): Promise<DatabaseProperty> {
    const existingConfig = existing.config as RelationConfig;
    const wantsTwoWay = Boolean((rawConfig as { twoWay?: unknown }).twoWay);
    const targetDatabaseId =
      typeof rawConfig.targetDatabaseId === 'string' ? rawConfig.targetDatabaseId : existingConfig.targetDatabaseId;
    const allowMultiple =
      typeof rawConfig.allowMultiple === 'boolean' ? rawConfig.allowMultiple : existingConfig.allowMultiple;

    const property = await this.db.transaction(async (tx) => {
      let inversePropertyId = existingConfig.inversePropertyId;

      if (wantsTwoWay && !inversePropertyId) {
        const position = await this.nextPropertyPosition(targetDatabaseId, tx);
        const [inverseProperty] = await tx
          .insert(databaseProperties)
          .values({
            databaseId: targetDatabaseId,
            name: existing.name,
            type: 'relation',
            position,
            config: { targetDatabaseId: existing.databaseId, allowMultiple: true, inversePropertyId: existing.id },
          })
          .returning();
        inversePropertyId = inverseProperty.id;
      } else if (!wantsTwoWay && inversePropertyId) {
        await tx.delete(databaseRelationLinks).where(eq(databaseRelationLinks.propertyId, inversePropertyId));
        await tx.delete(databaseProperties).where(eq(databaseProperties.id, inversePropertyId));
        inversePropertyId = null;
      }

      const [updated] = await tx
        .update(databaseProperties)
        .set({
          ...(name !== undefined ? { name } : {}),
          config: { targetDatabaseId, allowMultiple, inversePropertyId },
        })
        .where(eq(databaseProperties.id, existing.id))
        .returning();

      if (inversePropertyId) {
        await tx
          .update(databaseProperties)
          .set({ config: { targetDatabaseId: existing.databaseId, allowMultiple: true, inversePropertyId: existing.id } })
          .where(eq(databaseProperties.id, inversePropertyId));
      }

      return updated;
    });

    this.formulaGraph.invalidate(existing.databaseId);
    this.formulaGraph.invalidate(targetDatabaseId);
    return property;
  }

  /**
   * Parses `config.source` server-side (name→id resolution needs this
   * database's live property list) and computes `ast`/`volatile` — these are
   * never client-authored (§24A.1, §24A.3). Rejects an unresolvable
   * `prop()` name or a cyclic/self-referencing formula with a 400 that names
   * the offending path (§24A.4), checked before anything is persisted.
   */
  private async buildFormulaConfig(
    databaseId: string,
    propertyId: string,
    propertyName: string,
    rawConfig: Record<string, unknown> | undefined,
  ): Promise<FormulaConfig> {
    const source = typeof rawConfig?.source === 'string' ? rawConfig.source : '';

    const properties = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId));
    const nameToId = new Map(properties.filter((p) => p.id !== propertyId).map((p) => [p.name, p.id]));
    nameToId.set(propertyName, propertyId);

    let ast: FormulaAst;
    try {
      ast = parseFormula(source, (name) => nameToId.get(name));
    } catch (err) {
      if (err instanceof FormulaSyntaxError) throw new BadRequestException(err.message);
      throw err;
    }

    const cycle = await this.formulaGraph.detectCycle(databaseId, propertyId, referencedPropertyIds(ast), propertyName);
    if (cycle) throw new BadRequestException(`Circular formula reference: ${cycle.join(' -> ')}`);

    return { source, ast, volatile: isVolatile(ast), returnType: 'unknown' };
  }

  /**
   * `relationPropertyId` must be a `relation` property on this database;
   * `targetPropertyId` must live on that relation's target database and not
   * itself be a `rollup` — rollup-of-rollup is out of scope, rejected at
   * config time rather than computed wrong (§24A.5, §24B.4).
   */
  private async validateRollupConfig(databaseId: string, rawConfig: Record<string, unknown> | undefined): Promise<void> {
    const relationPropertyId = rawConfig?.relationPropertyId;
    const targetPropertyId = rawConfig?.targetPropertyId;
    if (typeof relationPropertyId !== 'string' || typeof targetPropertyId !== 'string') return; // zod already rejects a missing/malformed shape

    const [relationProperty] = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.id, relationPropertyId));
    if (!relationProperty || relationProperty.databaseId !== databaseId || relationProperty.type !== 'relation') {
      throw new BadRequestException('relationPropertyId must reference a relation property on this database');
    }

    const relationConfig = relationProperty.config as RelationConfig;
    const [targetProperty] = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.id, targetPropertyId));
    if (!targetProperty || targetProperty.databaseId !== relationConfig.targetDatabaseId) {
      throw new BadRequestException("targetPropertyId must belong to the relation's target database");
    }
    if (targetProperty.type === 'rollup') {
      throw new BadRequestException('A rollup cannot target another rollup (1-hop limit)');
    }
  }

  /**
   * Rejects (409) when another formula still reads this property (§20A.5) —
   * this sprint implements the reject path, not cascading formula deletion.
   * Otherwise, in one transaction: drops `database_relation_links` rows for a
   * `relation` property, strips the key from every row's `values`/`computed`
   * in this database, sweeps every view's config through `migrateViewConfig`
   * (which prunes any now-dangling `propertyId` reference), then deletes the
   * property itself.
   */
  async deleteProperty(id: string): Promise<{ id: string; deleted: boolean }> {
    const property = await this.ensureProperty(id);

    const dependents = await this.formulaGraph.dependentsOf(property.databaseId, id);
    if (dependents.length > 0) {
      const siblings = await this.db
        .select()
        .from(databaseProperties)
        .where(eq(databaseProperties.databaseId, property.databaseId));
      const names = siblings.filter((p) => dependents.includes(p.id)).map((p) => p.name);
      throw new ConflictException(`Cannot delete: still referenced by formula(s) ${names.join(', ')}`);
    }

    await this.db.transaction(async (tx) => {
      if (property.type === 'relation') {
        await tx.delete(databaseRelationLinks).where(eq(databaseRelationLinks.propertyId, id));
      }

      await tx
        .update(databaseRows)
        .set({
          values: sql`(${databaseRows.values} - ${id}::text)`,
          computed: sql`(${databaseRows.computed} - ${id}::text)`,
        })
        .where(eq(databaseRows.databaseId, property.databaseId));

      await tx.delete(databaseProperties).where(eq(databaseProperties.id, id));

      const remainingProperties = await tx
        .select()
        .from(databaseProperties)
        .where(eq(databaseProperties.databaseId, property.databaseId));
      const views = await tx.select().from(databaseViews).where(eq(databaseViews.databaseId, property.databaseId));
      for (const view of views) {
        const migrated = migrateViewConfig(view.config, view.type as ViewType, remainingProperties);
        await tx.update(databaseViews).set({ config: migrated }).where(eq(databaseViews.id, view.id));
      }
    });

    this.formulaGraph.invalidate(property.databaseId);
    return { id, deleted: true };
  }

  /**
   * Links two rows via a relation property (§23A) — inserts into
   * `database_relation_links`, mirroring onto the inverse property's own
   * link row when the relation is two-way, so each side can be queried by
   * its own `property_id` without a join-direction flag. Recomputes any
   * formula/rollup on both rows in the same transaction, since a rollup
   * following this relation just gained a new linked row.
   */
  async addRelation(rowId: string, propertyId: string, toRowId: string): Promise<{ linked: boolean }> {
    const property = await this.ensureProperty(propertyId);
    if (property.type !== 'relation') throw new BadRequestException('Property is not a relation');
    const config = property.config as RelationConfig;

    await this.db.transaction(async (tx) => {
      await tx.insert(databaseRelationLinks).values({ propertyId, fromRowId: rowId, toRowId }).onConflictDoNothing();
      await this.recomputeRowById(tx, property.databaseId, rowId);

      if (config.inversePropertyId) {
        await tx
          .insert(databaseRelationLinks)
          .values({ propertyId: config.inversePropertyId, fromRowId: toRowId, toRowId: rowId })
          .onConflictDoNothing();
        const [inverseProperty] = await tx
          .select()
          .from(databaseProperties)
          .where(eq(databaseProperties.id, config.inversePropertyId));
        if (inverseProperty) await this.recomputeRowById(tx, inverseProperty.databaseId, toRowId);
      }
    });

    return { linked: true };
  }

  /** Unlinks two rows — the mirror image of `addRelation`, same recompute scope. */
  async removeRelation(rowId: string, propertyId: string, toRowId: string): Promise<{ linked: boolean }> {
    const property = await this.ensureProperty(propertyId);
    if (property.type !== 'relation') throw new BadRequestException('Property is not a relation');
    const config = property.config as RelationConfig;

    await this.db.transaction(async (tx) => {
      await tx
        .delete(databaseRelationLinks)
        .where(and(eq(databaseRelationLinks.propertyId, propertyId), eq(databaseRelationLinks.fromRowId, rowId), eq(databaseRelationLinks.toRowId, toRowId)));
      await this.recomputeRowById(tx, property.databaseId, rowId);

      if (config.inversePropertyId) {
        await tx
          .delete(databaseRelationLinks)
          .where(
            and(
              eq(databaseRelationLinks.propertyId, config.inversePropertyId),
              eq(databaseRelationLinks.fromRowId, toRowId),
              eq(databaseRelationLinks.toRowId, rowId),
            ),
          );
        const [inverseProperty] = await tx
          .select()
          .from(databaseProperties)
          .where(eq(databaseProperties.id, config.inversePropertyId));
        if (inverseProperty) await this.recomputeRowById(tx, inverseProperty.databaseId, toRowId);
      }
    });

    return { linked: false };
  }

  private async recomputeRowById(tx: DrizzleTx, databaseId: string, rowId: string): Promise<void> {
    const [row] = await tx.select().from(databaseRows).where(eq(databaseRows.id, rowId));
    if (!row) return;
    const properties = await tx.select().from(databaseProperties).where(eq(databaseProperties.databaseId, databaseId));
    await this.formulaRecompute.recomputeRow(tx, databaseId, row, properties);
  }

  /**
   * Creates a row, and — in the same transaction (§20D.2) — the row's own
   * detail page. `templateId` seeds `values` from a saved row template
   * (§20D), with any explicit `values` overriding matching keys.
   */
  async createRow(
    databaseId: string,
    values?: Record<string, unknown>,
    id?: string,
    templateId?: string,
  ): Promise<DatabaseRow> {
    const database = await this.findById(databaseId);

    return this.db.transaction(async (tx) => {
      const position = await this.nextRowPosition(databaseId, tx);

      let seededValues = values ?? {};
      if (templateId) {
        const [template] = await tx.select().from(templates).where(eq(templates.id, templateId));
        if (template?.content && typeof template.content === 'object') {
          seededValues = { ...(template.content as Record<string, unknown>), ...seededValues };
        }
      }

      // Row-locked so two concurrent creates can't allocate the same
      // unique_id_seq (§20A.3 — config.nextValue is the counter of record).
      const [uniqueIdProperty] = await tx
        .select()
        .from(databaseProperties)
        .where(and(eq(databaseProperties.databaseId, databaseId), eq(databaseProperties.type, 'unique_id')))
        .for('update');

      let uniqueIdSeq: number | null = null;
      if (uniqueIdProperty) {
        const config = (uniqueIdProperty.config ?? {}) as { prefix?: string; nextValue?: number };
        uniqueIdSeq = config.nextValue ?? 1;
        await tx
          .update(databaseProperties)
          .set({ config: { ...config, nextValue: uniqueIdSeq + 1 } })
          .where(eq(databaseProperties.id, uniqueIdProperty.id));
      }

      const [row] = await tx
        .insert(databaseRows)
        .values({
          ...(id ? { id } : {}),
          databaseId,
          values: seededValues,
          position,
          uniqueIdSeq,
        })
        .returning();

      const titleProperty = await tx
        .select()
        .from(databaseProperties)
        .where(and(eq(databaseProperties.databaseId, databaseId), eq(databaseProperties.type, 'title')));
      const titleValue = titleProperty[0] ? seededValues[titleProperty[0].id] : undefined;

      const [rowPage] = await tx
        .insert(pages)
        .values({
          workspaceId: database.workspaceId,
          parentPageId: database.ownerPageId,
          databaseId,
          title: typeof titleValue === 'string' && titleValue.length > 0 ? titleValue : 'Untitled',
        })
        .returning();

      const [updated] = await tx
        .update(databaseRows)
        .set({ pageId: rowPage.id })
        .where(eq(databaseRows.id, row.id))
        .returning();

      const properties = await tx.select().from(databaseProperties).where(eq(databaseProperties.databaseId, databaseId));
      return this.formulaRecompute.recomputeRow(tx, databaseId, updated, properties);
    });
  }

  /**
   * Whole-value replace (§70-api-contract). If the row has its own page and
   * the title property changed, `pages.title` is kept in sync in the same
   * transaction (§20D.4) — direct table update, not a `PagesService` call,
   * so this module doesn't need a dependency on `PagesModule`.
   */
  async updateRow(id: string, values: Record<string, unknown>): Promise<DatabaseRow> {
    const row = await this.ensureRow(id);

    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(databaseRows)
        .set({ values, updatedAt: sql`now()` })
        .where(eq(databaseRows.id, id))
        .returning();

      if (row.pageId) {
        const [titleProperty] = await tx
          .select()
          .from(databaseProperties)
          .where(and(eq(databaseProperties.databaseId, row.databaseId), eq(databaseProperties.type, 'title')));
        const nextTitle = titleProperty ? values[titleProperty.id] : undefined;
        if (titleProperty && row.values?.[titleProperty.id] !== nextTitle) {
          await tx
            .update(pages)
            .set({
              title: typeof nextTitle === 'string' && nextTitle.length > 0 ? nextTitle : 'Untitled',
              updatedAt: sql`now()`,
            })
            .where(eq(pages.id, row.pageId));
        }
      }

      const properties = await tx
        .select()
        .from(databaseProperties)
        .where(eq(databaseProperties.databaseId, row.databaseId));
      const recomputed = await this.formulaRecompute.recomputeRow(tx, row.databaseId, updated, properties);

      // A rollup elsewhere may follow a relation that points at this row
      // (§24A.5 case 3, §24B.4) — its target value just changed underneath it.
      const referencingPropertyIds = await tx
        .selectDistinct({ propertyId: databaseRelationLinks.propertyId })
        .from(databaseRelationLinks)
        .where(eq(databaseRelationLinks.toRowId, id));
      if (referencingPropertyIds.length > 0) {
        await this.formulaRecompute.recomputeDependents(
          tx,
          id,
          referencingPropertyIds.map((r) => r.propertyId),
        );
      }

      return recomputed;
    });
  }

  async deleteRow(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.ensureRow(id);
    await this.db.delete(databaseRows).where(eq(databaseRows.id, id));
    return { id, deleted: true };
  }

  /** Soft delete a row — mirrors onto its page, if it has one, in the same transaction (§20D.5). */
  async archiveRow(id: string): Promise<DatabaseRow> {
    return this.setRowArchived(id, true);
  }

  async restoreRow(id: string): Promise<DatabaseRow> {
    return this.setRowArchived(id, false);
  }

  private async setRowArchived(id: string, isArchived: boolean): Promise<DatabaseRow> {
    const row = await this.ensureRow(id);
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(databaseRows)
        .set({ isArchived, updatedAt: sql`now()` })
        .where(eq(databaseRows.id, id))
        .returning();
      if (row.pageId) {
        await tx.update(pages).set({ isArchived, updatedAt: sql`now()` }).where(eq(pages.id, row.pageId));
      }
      return updated;
    });
  }

  async createView(
    databaseId: string,
    data: { id?: string; name: string; type: string; config?: Record<string, unknown> },
  ): Promise<DatabaseView> {
    await this.ensureDatabase(databaseId);
    const position = await this.nextViewPosition(databaseId);
    const [view] = await this.db
      .insert(databaseViews)
      .values({
        ...(data.id ? { id: data.id } : {}),
        databaseId,
        name: data.name,
        type: data.type,
        config: data.config ?? null,
        position,
      })
      .returning();
    return view;
  }

  async updateView(
    id: string,
    data: { name?: string; config?: Record<string, unknown> },
  ): Promise<DatabaseView> {
    await this.ensureView(id);
    const [view] = await this.db
      .update(databaseViews)
      .set({ ...data })
      .where(eq(databaseViews.id, id))
      .returning();
    return view;
  }

  async deleteView(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.ensureView(id);
    await this.db.delete(databaseViews).where(eq(databaseViews.id, id));
    return { id, deleted: true };
  }

  /** Copies a view's config verbatim onto a new tab, right after the source (§21, "Duplicate view"). */
  async duplicateView(id: string): Promise<DatabaseView> {
    const view = await this.ensureView(id);
    const position = await this.nextViewPosition(view.databaseId);
    const [copy] = await this.db
      .insert(databaseViews)
      .values({
        databaseId: view.databaseId,
        name: `${view.name} (copy)`,
        type: view.type,
        config: view.config,
        position,
      })
      .returning();
    return copy;
  }

  /** Swaps `position` with the adjacent tab (§21, tab reorder — pointer-drag lands in Sprint 21). */
  async moveView(id: string, direction: 'left' | 'right'): Promise<DatabaseView[]> {
    const view = await this.ensureView(id);
    const siblings = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, view.databaseId))
      .orderBy(asc(databaseViews.position));

    const index = siblings.findIndex((v) => v.id === id);
    const swapWith = direction === 'left' ? siblings[index - 1] : siblings[index + 1];
    if (!swapWith) return siblings;

    await this.db.transaction(async (tx) => {
      await tx.update(databaseViews).set({ position: swapWith.position }).where(eq(databaseViews.id, view.id));
      await tx.update(databaseViews).set({ position: view.position }).where(eq(databaseViews.id, swapWith.id));
    });

    return this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, view.databaseId))
      .orderBy(asc(databaseViews.position));
  }

  private async ensureView(id: string): Promise<DatabaseView> {
    const [view] = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, id));
    if (!view) throw new NotFoundException(`View ${id} not found`);
    return view;
  }

  private async nextViewPosition(databaseId: string): Promise<number> {
    const rows = await this.db
      .select({ max: sql<number>`coalesce(max(${databaseViews.position}), -1)` })
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, databaseId));
    return rows[0].max + 1;
  }

  private async ensureDatabase(id: string): Promise<void> {
    const [db] = await this.db.select().from(databases).where(eq(databases.id, id));
    if (!db) throw new NotFoundException(`Database ${id} not found`);
  }

  private async ensureProperty(id: string): Promise<DatabaseProperty> {
    const [p] = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.id, id));
    if (!p) throw new NotFoundException(`Property ${id} not found`);
    return p;
  }

  private async ensureRow(id: string): Promise<DatabaseRow> {
    const [r] = await this.db.select().from(databaseRows).where(eq(databaseRows.id, id));
    if (!r) throw new NotFoundException(`Row ${id} not found`);
    return r;
  }

  private async nextPropertyPosition(databaseId: string, tx: DrizzleTx | DrizzleDB = this.db): Promise<number> {
    const rows = await tx
      .select({ max: sql<number>`coalesce(max(${databaseProperties.position}), -1)` })
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId));
    return rows[0].max + 1;
  }

  private async nextRowPosition(databaseId: string, tx: DrizzleTx | DrizzleDB = this.db): Promise<number> {
    const rows = await tx
      .select({ max: sql<number>`coalesce(max(${databaseRows.position}), -1)` })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, databaseId));
    return rows[0].max + 1;
  }

  /** Row lookup for the row-page properties panel (§20D). */
  async findRowByPageId(pageId: string): Promise<DatabaseRow | null> {
    const [row] = await this.db.select().from(databaseRows).where(eq(databaseRows.pageId, pageId));
    return row ?? null;
  }
}
