'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { linkToPageDropPlugin } from './link-to-page-drop-plugin';

/** Points at an existing page (§12B.3) — a picker until one is chosen, then an inline link. */
function LinkToPageView({ node, updateAttributes }: NodeViewProps) {
  const router = useRouter();
  const pageId = node.attrs.pageId as string | null;
  const [query, setQuery] = useState('');

  const { data: page } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.getPage(pageId as string),
    enabled: !!pageId,
  });
  const { data: pages = [] } = useQuery({
    queryKey: ['pages'],
    queryFn: api.listPages,
    enabled: !pageId,
  });

  if (pageId) {
    return (
      <NodeViewWrapper
        className="my-1 flex items-center gap-2 rounded px-1 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        contentEditable={false}
      >
        <button onClick={() => router.push(`/${pageId}`)} className="flex items-center gap-2 text-left">
          <span className="text-lg">{page?.icon ?? '📄'}</span>
          <span className="border-b border-zinc-300 font-medium dark:border-zinc-600">
            {page?.title || 'Untitled'}
          </span>
        </button>
      </NodeViewWrapper>
    );
  }

  const matches = pages
    .filter((p) => !p.isArchived && p.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-2 dark:border-zinc-700" contentEditable={false}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Link to a page…"
        className="mb-1 w-full bg-transparent text-sm outline-none"
      />
      <div className="max-h-48 overflow-y-auto">
        {matches.map((p) => (
          <button
            key={p.id}
            onClick={() => updateAttributes({ pageId: p.id })}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span>{p.icon ?? '📄'}</span>
            <span>{p.title || 'Untitled'}</span>
          </button>
        ))}
        {matches.length === 0 && <p className="px-1.5 py-1 text-xs text-zinc-400">No matching pages.</p>}
      </div>
    </NodeViewWrapper>
  );
}

export const LinkToPage = Node.create({
  name: 'linkToPage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { pageId: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="link-to-page"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'link-to-page' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkToPageView);
  },

  // Sidebar -> editor drag (§19A.4, Sprint 22) — see link-to-page-drop-plugin.ts.
  addProseMirrorPlugins() {
    return [linkToPageDropPlugin];
  },
});
