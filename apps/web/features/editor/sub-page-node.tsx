'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/** Renders the child page this block created (§12B.3) — an inline link, not the page content itself. */
function SubPageView({ node }: NodeViewProps) {
  const router = useRouter();
  const pageId = node.attrs.pageId as string | null;

  const { data: page } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.getPage(pageId as string),
    enabled: !!pageId,
  });

  return (
    <NodeViewWrapper
      className="my-1 flex items-center gap-2 rounded px-1 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      contentEditable={false}
    >
      {pageId ? (
        <button
          onClick={() => router.push(`/${pageId}`)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-lg">{page?.icon ?? '📄'}</span>
          <span className="border-b border-zinc-300 font-medium dark:border-zinc-600">
            {page?.title || 'Untitled'}
          </span>
        </button>
      ) : (
        <span className="text-sm text-zinc-400">Creating page…</span>
      )}
    </NodeViewWrapper>
  );
}

export const SubPage = Node.create({
  name: 'subPage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { pageId: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="sub-page"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'sub-page' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubPageView);
  },
});
