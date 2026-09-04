import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Full content schema (technical plan §10).
 *
 * `pages.type` is polymorphic: `document | database | whiteboard | diagram`.
 * The column lives here from the start (§65) so later content types are added
 * as new modules/rows, never as a schema migration.
 *
 * Column values that are filtered/sorted/related live in real columns;
 * flexible content lives in JSONB (§57 Decision 3). Indexes follow §47.
 */

// 10.2 workspaces — single default workspace for the single user.
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 10.3 pages
export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    parentPageId: uuid('parent_page_id').references((): AnyPgColumn => pages.id),
    title: text('title').notNull(),
    icon: text('icon'),
    coverUrl: text('cover_url'),
    type: text('type').notNull().default('document'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    position: integer('position').notNull().default(0),
    // fullWidth, smallText, font, locked, coverPosition — not filtered/sorted,
    // so it lives in JSONB rather than dedicated columns (§57 Decision 3).
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    // Set only for a row page (§20D.1) — the row's detail page, rendered as a
    // plain document plus a properties panel, never a new content type
    // (ADR-08). No `on delete cascade`: deleting a database soft-deletes its
    // row pages through the service layer instead (§20D.5, §10B).
    databaseId: uuid('database_id').references((): AnyPgColumn => databases.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('pages_workspace_idx').on(table.workspaceId),
    parentIdx: index('pages_parent_idx').on(table.parentPageId),
    updatedIdx: index('pages_updated_idx').on(table.updatedAt),
    favoriteIdx: index('pages_favorite_idx').on(table.isFavorite),
    databaseIdx: index('pages_database_idx').on(table.databaseId),
  }),
);

// 10.4 blocks — document content.
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    parentBlockId: uuid('parent_block_id').references((): AnyPgColumn => blocks.id),
    type: text('type').notNull(),
    position: integer('position').notNull().default(0),
    content: jsonb('content').$type<unknown>(),
    properties: jsonb('properties').$type<Record<string, unknown>>(),
    // Ids of blocks nested inside this node's `content` JSON (columns, toggles,
    // table cells — never normalized into their own rows, §11E.4). Lets a
    // nested block be found with one indexed query instead of scanning every
    // row's JSON.
    descendantIds: uuid('descendant_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pageIdx: index('blocks_page_idx').on(table.pageId),
    parentBlockIdx: index('blocks_parent_idx').on(table.parentBlockId),
    positionIdx: index('blocks_position_idx').on(table.position),
    descendantIdsIdx: index('blocks_descendants_idx').using('gin', table.descendantIds),
  }),
);

// 10.5 databases
export const databases = pgTable(
  'databases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    // The page this database physically lives on — always set, whether the
    // database is a full page (`isInline = false`) or embedded inside one
    // (`isInline = true`, §20C.2). Cascades: a database dies with its owner
    // page's permanent delete.
    ownerPageId: uuid('owner_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    isInline: boolean('is_inline').notNull().default(false),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerPageIdx: index('databases_owner_page_idx').on(table.ownerPageId),
    // "One full-page database per page" stays a DB-enforced invariant; a
    // document page may hold any number of inline databases (§20C.2).
    fullPageUniq: uniqueIndex('databases_full_page_uniq')
      .on(table.ownerPageId)
      .where(sql`${table.isInline} = false`),
  }),
);

// 10.6 database_properties
export const databaseProperties = pgTable(
  'database_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    databaseId: uuid('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    databaseIdx: index('database_properties_database_idx').on(table.databaseId),
  }),
);

// 10.7 database_rows — each row can carry its own detail page.
export const databaseRows = pgTable(
  'database_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    databaseId: uuid('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id),
    values: jsonb('values').$type<Record<string, unknown>>(),
    position: integer('position').notNull().default(0),
    // The row's permanent number for a `unique_id` property (§20A.2) — assigned
    // once at creation from that property's config.nextValue counter, never
    // reassigned. Null for databases with no unique_id property.
    uniqueIdSeq: integer('unique_id_seq'),
    // Mirrors the row's page's isArchived when it has one (§20D.5, one
    // transaction both ways) — a soft-deleted row never appears in a query.
    isArchived: boolean('is_archived').notNull().default(false),
    // Formula & rollup results (§24A, §24B) — written ONLY by the API's
    // recompute pipeline, never by the client (§14, §57). `values` is input;
    // this is everything derived from it.
    computed: jsonb('computed').$type<Record<string, unknown>>().notNull().default({}),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    databaseIdx: index('database_rows_database_idx').on(table.databaseId),
    // §22A.5 — equality/containment filters (select, status, checkbox,
    // multi_select) are servable by this index; range/sort on text/number/date
    // are not (extraction+cast happens per-query, no expression index possible
    // for dynamic property-id keys). Deliberate limit, not an oversight.
    valuesGinIdx: index('database_rows_values_gin').using('gin', sql`${table.values} jsonb_path_ops`),
    databasePositionIdx: index('database_rows_db_pos').on(table.databaseId, table.position),
  }),
);

// database_relation_links (§23A.1) — a table, not a values[] array: relation
// is filtered, sorted, and related, so it earns real rows (§57 Decision 3),
// not the JSONB exception. `values` never stores relation; the API
// projects it at read time.
export const databaseRelationLinks = pgTable(
  'database_relation_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => databaseProperties.id, { onDelete: 'cascade' }),
    fromRowId: uuid('from_row_id')
      .notNull()
      .references(() => databaseRows.id, { onDelete: 'cascade' }),
    toRowId: uuid('to_row_id')
      .notNull()
      .references(() => databaseRows.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniqueLink: uniqueIndex('database_relation_links_uniq').on(
      table.propertyId,
      table.fromRowId,
      table.toRowId,
    ),
    // "Baris mana saja yang menunjuk ke baris ini" — every rollup
    // recompute and dependent-row lookup runs this exact query (§23A.1, §24B.4).
    toRowIdx: index('database_relation_links_to_row_idx').on(table.toRowId, table.propertyId),
    fromRowIdx: index('database_relation_links_from_row_idx').on(table.fromRowId, table.propertyId),
  }),
);

// 10.8 database_views
export const databaseViews = pgTable(
  'database_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    databaseId: uuid('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    databaseIdx: index('database_views_database_idx').on(table.databaseId),
  }),
);

// 10.9 attachments — binary files live in object storage, referenced here.
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id').references(() => blocks.id),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pageIdx: index('attachments_page_idx').on(table.pageId),
  }),
);

// 10.10 templates
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Row templates (§20D) are scoped to one database; page templates (not
    // yet built) would leave this null — the same table, distinguished by
    // which FK is set, rather than two near-identical tables.
    databaseId: uuid('database_id').references(() => databases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    description: text('description'),
    content: jsonb('content').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    databaseIdx: index('templates_database_idx').on(table.databaseId),
  }),
);

// 10.11 page_canvases — whiteboard & diagram content (schema-less by design).
export const pageCanvases = pgTable('page_canvases', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' })
    .unique(),
  canvasKind: text('canvas_kind').notNull(),
  elements: jsonb('elements').$type<unknown>(),
  viewport: jsonb('viewport').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 10.14 page_links — backlinks, rebuilt for the source page inside the same
// transaction as PUT /pages/:id/blocks (§15A.2). Never a trigger or job.
export const pageLinks = pgTable(
  'page_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    sourceBlockId: uuid('source_block_id').notNull(),
    targetPageId: uuid('target_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    targetBlockId: uuid('target_block_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceIdx: index('page_links_source_idx').on(table.sourcePageId),
    targetIdx: index('page_links_target_idx').on(table.targetPageId),
  }),
);

// link_previews — server-fetched bookmark metadata cache (§29A.1). Cached
// here, not in object storage, because it needs TTL/query, not blob storage.
export const linkPreviews = pgTable('link_previews', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull().unique(),
  title: text('title'),
  description: text('description'),
  imageUrl: text('image_url'),
  faviconUrl: text('favicon_url'),
  status: text('status').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Type exports
export type PageType = 'document' | 'database' | 'whiteboard' | 'diagram';

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;

export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;

export type Database = typeof databases.$inferSelect;
export type NewDatabase = typeof databases.$inferInsert;

export type DatabaseProperty = typeof databaseProperties.$inferSelect;
export type DatabaseRow = typeof databaseRows.$inferSelect;
export type DatabaseView = typeof databaseViews.$inferSelect;

export type DatabaseRelationLink = typeof databaseRelationLinks.$inferSelect;
export type NewDatabaseRelationLink = typeof databaseRelationLinks.$inferInsert;

export type Attachment = typeof attachments.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type PageCanvas = typeof pageCanvases.$inferSelect;

export type PageLink = typeof pageLinks.$inferSelect;
export type NewPageLink = typeof pageLinks.$inferInsert;

export type LinkPreview = typeof linkPreviews.$inferSelect;
export type NewLinkPreview = typeof linkPreviews.$inferInsert;
