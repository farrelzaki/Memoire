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
  | 'unique_id';

/** Mirrors the backend `databases` row (§10.5). */
export interface Database {
  id: string;
  pageId: string;
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
  createdAt: string;
  updatedAt: string;
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

/** A single search result from `GET /search` (§25). */
export interface SearchHit {
  type: 'page' | 'block' | 'database' | 'row';
  pageId: string;
  title: string;
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
