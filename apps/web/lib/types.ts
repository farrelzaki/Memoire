export type PageType = 'document' | 'database' | 'whiteboard' | 'diagram';

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
  | 'checkbox'
  | 'date'
  | 'url';

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
