export type PageType = 'document' | 'database' | 'whiteboard' | 'diagram';

/** Not filtered/sorted, so it's one JSONB blob on the server (§57 Decision 3). */
export interface PageSettings {
  fullWidth?: boolean;
  smallText?: boolean;
  font?: 'default' | 'serif' | 'mono';
  locked?: boolean;
  coverPosition?: { y: number };
}

/**
 * Mirrors the backend `pages` row (§10.3). Dates arrive as ISO strings over
 * JSON. Shared types will move to `packages/types` once both apps import them.
 */
export interface Page {
  id: string;
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  type: PageType;
  isFavorite: boolean;
  isArchived: boolean;
  position: number;
  settings: PageSettings;
  // Set only for a row page — this page IS a database row's detail page
  // (§20D.1), rendered as a plain document plus a properties panel.
  databaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Minimal Tiptap/ProseMirror JSON node shape (self-contained). */
export interface TiptapNode {
  type?: string;
  content?: TiptapNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Mirrors the backend `blocks` row (§10.4). */
export interface Block {
  id: string;
  pageId: string;
  parentBlockId: string | null;
  type: string;
  position: number;
  content: TiptapNode | null;
  properties: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Response shape of `GET /pages/:id/backlinks` (§15A.3). */
export interface Backlink {
  sourcePageId: string;
  sourcePageTitle: string;
  sourceBlockId: string;
  snippet: string | null;
}

/** Response shape of `POST /link-preview` (§29A.1). */
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  status: 'ok' | 'error';
}

/** Mirrors the backend `attachments` row (§10.9). */
export interface Attachment {
  id: string;
  pageId: string | null;
  blockId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type PropertyType =
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
  | 'unique_id'
  | 'relation'
  | 'rollup'
  | 'formula';

/** Mirrors `@memoire/validation`'s `RelationConfig` (§23A). */
export interface RelationConfig {
  targetDatabaseId: string;
  allowMultiple: boolean;
  inversePropertyId: string | null;
}

/** Mirrors `@memoire/validation`'s `RollupConfig` (§24B.1). */
export interface RollupConfig {
  relationPropertyId: string;
  targetPropertyId: string;
  function: CalculationId | 'show_original';
}

/** Mirrors `@memoire/validation`'s `FormulaConfig` (§24A.1). `ast` is opaque here — only `@memoire/formula` (not yet shared with web) interprets it; the client only ever displays `source` and reads the materialized value from `row.computed`. */
export interface FormulaConfig {
  source: string;
  ast: unknown;
  volatile: boolean;
  returnType: 'number' | 'string' | 'boolean' | 'date' | 'unknown';
}

/** Mirrors the backend `databases` row (§10.5, §20C.2). */
export interface Database {
  id: string;
  workspaceId: string;
  ownerPageId: string;
  isInline: boolean;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `database_properties` (§10.6). */
export interface DatabaseProperty {
  id: string;
  databaseId: string;
  name: string;
  type: PropertyType;
  config: Record<string, unknown> | null;
  position: number;
}

/** Mirrors `database_rows` (§10.7). */
export interface DatabaseRow {
  id: string;
  databaseId: string;
  pageId: string | null;
  values: Record<string, unknown> | null;
  position: number;
  uniqueIdSeq: number | null;
  isArchived: boolean;
  // Formula/rollup results (§24A, §24B) — written only by the API, never the
  // client (§14, §57). A formula/rollup cell reads from here, not `values`.
  computed: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Row templates (§20D) — pre-filled `values` a new row can be seeded from. */
export interface RowTemplate {
  id: string;
  databaseId: string;
  name: string;
  icon: string | null;
  content: Record<string, unknown> | null;
}

export interface DatabaseAggregate {
  database: Database;
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  views: DatabaseView[];
}

export interface DatabaseView {
  id: string;
  databaseId: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  position: number;
}

/** Mirrors `@memoire/validation`'s `FilterOperator` (§22A.3). */
export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'does_not_contain'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'is_any_of'
  | 'is_none_of'
  | 'is_before'
  | 'is_after'
  | 'is_on_or_before'
  | 'is_on_or_after'
  | 'is_within';

export type FilterValue = string | number | boolean | (string | number)[] | null;

export interface FilterRule {
  propertyId: string;
  operator: FilterOperator;
  value?: FilterValue;
}

export interface FilterGroup {
  conjunction: 'and' | 'or';
  rules: (FilterRule | FilterGroup)[];
}

/** The 20 aggregate functions (§20B.1), shared by column calculations and rollup. */
export type CalculationId =
  | 'count_all'
  | 'count_values'
  | 'count_unique'
  | 'count_empty'
  | 'count_not_empty'
  | 'percent_empty'
  | 'percent_not_empty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'earliest_date'
  | 'latest_date'
  | 'date_range'
  | 'checked'
  | 'unchecked'
  | 'percent_checked'
  | 'percent_unchecked';

/** Mirrors `@memoire/validation`'s `ViewConfig` (§21A.1) — validated/migrated server-side, never held in React state. */
export interface ViewConfig {
  version: 1;
  filter: FilterGroup | null;
  sorts: Array<{ propertyId: string; direction: 'asc' | 'desc' }>;
  properties: Array<{ propertyId: string; visible: boolean; width?: number }>;
  calculations: Record<string, CalculationId>;
  pageSize: number;
  openAs: 'side' | 'center' | 'full';
  locked: boolean;
  search: string;
  // Per-view-type fields (table/board/calendar/gallery) — see view-type-registry.ts.
  [key: string]: unknown;
}

export interface DatabaseQueryGroup {
  key: string | null;
  count: number;
  calculations: Record<string, unknown>;
}

/** Response of `POST /databases/:id/query` (§22A.1). */
export interface DatabaseQueryResult {
  rows: DatabaseRow[];
  groups: DatabaseQueryGroup[] | null;
  calculations: Record<string, unknown>;
  total: number;
  nextCursor: string | null;
  computedAt: string;
}

/** Mirrors `@memoire/validation`'s `SearchHit` (§25A) — a single ranked result from `GET /search`. */
export interface SearchHit {
  type: 'page' | 'block' | 'database' | 'row';
  pageId: string;
  blockId?: string;
  rowId?: string;
  databaseId?: string;
  title: string;
  breadcrumb: string[];
  snippet: string | null;
  rank: number;
}

/** Mirrors `@memoire/validation`'s `searchQuerySchema` (§25A) — params for `GET /search`. */
export interface SearchQueryParams {
  mode?: 'quick' | 'full';
  type?: 'document' | 'database' | 'whiteboard' | 'diagram';
  timeRange?: '7d' | '30d' | 'year';
  locationPageId?: string;
  sort?: 'relevance' | 'updated';
  limit?: number;
}

/** Mirrors `page_canvases` (§10.11) — whiteboard/diagram content. */
export interface CanvasData {
  id: string;
  pageId: string;
  canvasKind: string;
  elements: unknown[] | null;
  viewport: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type VersionKind = 'auto' | 'manual' | 'pre_restore' | 'pre_import';

/** `GET /pages/:id/versions` list entry — no block content (§33A.1). */
export interface VersionSummary {
  id: string;
  pageId: string;
  version: number;
  kind: VersionKind;
  label: string | null;
  title: string;
  icon: string | null;
  storageKey: string | null;
  contentHash: string;
  sizeBytes: number;
  createdAt: string;
}

export interface VersionBlockSnapshot {
  id: string;
  type: string;
  content: TiptapNode | null;
  position: number;
}

/** `GET /versions/:id` — full content, resolved transparently from object storage if offloaded. */
export interface VersionFullContent {
  version: VersionSummary;
  blocks: VersionBlockSnapshot[];
}

export type BlockChangeStatus = 'added' | 'removed' | 'moved' | 'changed';
export interface WordDiffToken {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}
export interface BlockDiffEntry {
  blockId: string;
  status: BlockChangeStatus;
  type: string | null;
  oldPosition: number | null;
  newPosition: number | null;
  wordDiff?: WordDiffToken[];
}

/** `GET /versions/diff` (§33A.5). */
export interface VersionDiffResult {
  from: VersionSummary;
  to: VersionSummary;
  titleChanged: boolean;
  iconChanged: boolean;
  blockDiffs: BlockDiffEntry[];
}
