'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { DatabaseEditor } from '@/features/database/database-editor';

/**
 * Inline database (created fresh, embedded in this document) or linked view
 * (an existing database's view, embedded here) — same node, same renderer;
 * only `mode` and how `databaseId` got set differ (§20C.3). `DatabaseEditor`
 * already accepts a bare `databaseId`, so this NodeView is a thin wrapper
 * around it plus a picker for the not-yet-linked state.
 */
function DatabaseBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const databaseId = node.attrs.databaseId as string | null;
  const mode = node.attrs.mode as 'inline' | 'linked';
  const currentPageId = editor.extensionStorage.databaseView?.pageId as string | undefined;
  const [query, setQuery] = useState('');

  const { data: databases = [] } = useQuery({
    queryKey: ['databases'],
    queryFn: api.listDatabases,
    enabled: mode === 'linked' && !databaseId,
  });

  if (!databaseId) {
    const matches = databases.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    return (
      <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-2 dark:border-zinc-700" contentEditable={false}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Link to a database…"
          className="mb-1 w-full bg-transparent text-sm outline-none"
        />
        <div className="max-h-48 overflow-y-auto">
          {matches.map((d) => (
            <button
              key={d.id}
              onClick={() => updateAttributes({ databaseId: d.id })}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span>▤</span>
              <span>{d.name}</span>
            </button>
          ))}
          {matches.length === 0 && <p className="px-1.5 py-1 text-xs text-zinc-400">No matching databases.</p>}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <DatabaseBlockContent databaseId={databaseId} mode={mode} currentPageId={currentPageId} />
  );
}

function DatabaseBlockContent({
  databaseId,
  mode,
  currentPageId,
}: {
  databaseId: string;
  mode: 'inline' | 'linked';
  currentPageId: string | undefined;
}) {
  const { data: agg, isError } = useQuery({
    queryKey: ['database', databaseId],
    queryFn: () => api.getDatabaseById(databaseId),
    retry: false,
  });

  // Database was deleted out from under this block — never crash, never a blank space (§20C.4).
  if (isError) {
    return (
      <NodeViewWrapper className="my-1 rounded border border-dashed border-zinc-300 p-3 text-sm text-zinc-400 dark:border-zinc-600" contentEditable={false}>
        This database has been deleted.
      </NodeViewWrapper>
    );
  }

  const isLinkedElsewhere = mode === 'linked' && agg && agg.database.ownerPageId !== currentPageId;

  return (
    <NodeViewWrapper className="my-1 rounded border border-zinc-100 p-2 dark:border-zinc-800" contentEditable={false}>
      {isLinkedElsewhere && (
        <span className="mb-1 inline-block text-[10px] uppercase tracking-wide text-zinc-400">
          Linked view — {agg.database.name}
        </span>
      )}
      <DatabaseEditor databaseId={databaseId} />
    </NodeViewWrapper>
  );
}

export const DatabaseBlock = Node.create({
  name: 'databaseView',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { pageId: '' };
  },

  addStorage() {
    return { pageId: this.options.pageId };
  },

  addAttributes() {
    return {
      databaseId: { default: null },
      viewId: { default: null },
      mode: { default: 'inline' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-view"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'database-view' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockView);
  },
});
