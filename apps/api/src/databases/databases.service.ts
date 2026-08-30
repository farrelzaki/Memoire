import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import {
  Database,
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
  databases,
  databaseProperties,
  databaseRows,
  databaseViews,
} from '../db/schema';

export interface DatabaseAggregate {
  database: Database;
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  views: DatabaseView[];
}

@Injectable()
export class DatabasesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Default content for a `database` page (§11A createDefaultContent):
   * the databases row, two starter properties (Title + Text), and a Table view.
   */
  async createDefault(pageId: string, name: string): Promise<Database> {
    return this.db.transaction(async (tx) => {
      const [database] = await tx
        .insert(databases)
        .values({ pageId, name })
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

  async getByPage(pageId: string): Promise<DatabaseAggregate> {
    const [database] = await this.db
      .select()
      .from(databases)
      .where(eq(databases.pageId, pageId));
    if (!database) throw new NotFoundException(`Database for page ${pageId} not found`);

    const properties = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, database.id))
      .orderBy(asc(databaseProperties.position));
    const rows = await this.db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, database.id))
      .orderBy(asc(databaseRows.position));
    const views = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, database.id))
      .orderBy(asc(databaseViews.position));

    return { database, properties, rows, views };
  }

  async createProperty(databaseId: string, data: {
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }): Promise<DatabaseProperty> {
    await this.ensureDatabase(databaseId);
    const position = await this.nextPropertyPosition(databaseId);
    const [property] = await this.db
      .insert(databaseProperties)
      .values({
        databaseId,
        name: data.name,
        type: data.type,
        config: data.config ?? null,
        position,
      })
      .returning();
    return property;
  }

  async updateProperty(id: string, data: {
    name?: string;
    config?: Record<string, unknown>;
  }): Promise<DatabaseProperty> {
    await this.ensureProperty(id);
    const [property] = await this.db
      .update(databaseProperties)
      .set({ ...data })
      .where(eq(databaseProperties.id, id))
      .returning();
    return property;
  }

  async deleteProperty(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.ensureProperty(id);
    await this.db.delete(databaseProperties).where(eq(databaseProperties.id, id));
    return { id, deleted: true };
  }

  async createRow(databaseId: string, values?: Record<string, unknown>): Promise<DatabaseRow> {
    await this.ensureDatabase(databaseId);
    const position = await this.nextRowPosition(databaseId);
    const [row] = await this.db
      .insert(databaseRows)
      .values({ databaseId, values: values ?? {}, position })
      .returning();
    return row;
  }

  async updateRow(id: string, values: Record<string, unknown>): Promise<DatabaseRow> {
    await this.ensureRow(id);
    const [row] = await this.db
      .update(databaseRows)
      .set({ values, updatedAt: sql`now()` })
      .where(eq(databaseRows.id, id))
      .returning();
    return row;
  }

  async deleteRow(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.ensureRow(id);
    await this.db.delete(databaseRows).where(eq(databaseRows.id, id));
    return { id, deleted: true };
  }

  async createView(
    databaseId: string,
    data: { name: string; type: string; config?: Record<string, unknown> },
  ): Promise<DatabaseView> {
    await this.ensureDatabase(databaseId);
    const position = await this.nextViewPosition(databaseId);
    const [view] = await this.db
      .insert(databaseViews)
      .values({
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

  private async ensureView(id: string): Promise<void> {
    const [view] = await this.db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, id));
    if (!view) throw new NotFoundException(`View ${id} not found`);
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

  private async ensureProperty(id: string): Promise<void> {
    const [p] = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.id, id));
    if (!p) throw new NotFoundException(`Property ${id} not found`);
  }

  private async ensureRow(id: string): Promise<void> {
    const [r] = await this.db.select().from(databaseRows).where(eq(databaseRows.id, id));
    if (!r) throw new NotFoundException(`Row ${id} not found`);
  }

  private async nextPropertyPosition(databaseId: string): Promise<number> {
    const rows = await this.db
      .select({ max: sql<number>`coalesce(max(${databaseProperties.position}), -1)` })
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId));
    return rows[0].max + 1;
  }

  private async nextRowPosition(databaseId: string): Promise<number> {
    const rows = await this.db
      .select({ max: sql<number>`coalesce(max(${databaseRows.position}), -1)` })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, databaseId));
    return rows[0].max + 1;
  }
}
