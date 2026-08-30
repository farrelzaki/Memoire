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
