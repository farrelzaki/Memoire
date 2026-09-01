import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { DatabaseEditor } from '@/features/database/database-editor';
import { DocumentEditor } from '@/features/editor/document-editor';
import type { PageType } from '@/lib/types';
import { WhiteboardEditor } from './whiteboard/whiteboard-editor';

export interface ContentTypeDefinition {
  key: PageType;
  label: string;
  icon: string;
  renderer: ComponentType<{ pageId: string }>;
  createInSidebar: boolean;
}

// React Flow measures DOM nodes on mount — load it client-only, same as Excalidraw.
const DiagramEditor = dynamic(
  () => import('./diagram/diagram-editor').then((m) => m.DiagramEditor),
  { ssr: false },
);

/**
 * Frontend content-type registry (§11A). Adding a new page type = adding one
 * entry here + one renderer — the sidebar "New" menu and the page route both
 * read from this map, so they update automatically.
 */
export const contentTypes: Record<PageType, ContentTypeDefinition> = {
  document: {
    key: 'document',
    label: 'Document',
    icon: '📄',
    renderer: DocumentEditor,
    createInSidebar: true,
  },
  database: {
    key: 'database',
    label: 'Database',
    icon: '🗂️',
    renderer: DatabaseEditor,
    createInSidebar: true,
  },
  whiteboard: {
    key: 'whiteboard',
    label: 'Whiteboard',
    icon: '🖊️',
    renderer: WhiteboardEditor,
    createInSidebar: true,
  },
  diagram: {
    key: 'diagram',
    label: 'Diagram',
    icon: '📊',
    renderer: DiagramEditor,
    createInSidebar: true,
  },
};

export function getContentType(key: string): ContentTypeDefinition | undefined {
  return contentTypes[key as PageType];
}
