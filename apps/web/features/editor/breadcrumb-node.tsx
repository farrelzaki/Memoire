'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getBreadcrumbTrail } from '@/lib/pages';

/** Ancestor chain of the page this block lives in (§12B.3) — stores nothing, always derived. */
function BreadcrumbView({ editor }: NodeViewProps) {
  const router = useRouter();
  const pageId = editor.extensionStorage.breadcrumb?.pageId as string | undefined;

  const { data: pages = [] } = useQuery({ queryKey: ['pages'], queryFn: api.listPages });
  const trail = pageId ? getBreadcrumbTrail(pages, pageId) : [];

  return (
    <NodeViewWrapper className="my-1 flex items-center gap-1 text-sm text-zinc-500" contentEditable={false}>
      {trail.length === 0 && <span className="text-zinc-400">This page has no parent.</span>}
      {trail.map((page, i) => (
        <span key={page.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-zinc-300 dark:text-zinc-600">/</span>}
          <button
            onClick={() => router.push(`/${page.id}`)}
            className="flex items-center gap-1 hover:underline"
          >
            <span>{page.icon ?? '📄'}</span>
            <span>{page.title || 'Untitled'}</span>
          </button>
        </span>
      ))}
    </NodeViewWrapper>
  );
}

export const Breadcrumb = Node.create({
  name: 'breadcrumb',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { pageId: '' };
  },

  addStorage() {
    return { pageId: this.options.pageId };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="breadcrumb"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'breadcrumb' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BreadcrumbView);
  },
});
