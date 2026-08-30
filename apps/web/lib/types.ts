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
