'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * URL preview card fetched server-side (§29A.1) and cached into the node's
 * own attrs on first success, so re-opening the page never needs the network
 * again and a failed fetch still renders the link, never a blank block.
 */
function BookmarkView({ node, updateAttributes }: NodeViewProps) {
  const url = node.attrs.url as string | null;
  const title = node.attrs.title as string | null;
  const description = node.attrs.description as string | null;
  const imageUrl = node.attrs.imageUrl as string | null;
  const faviconUrl = node.attrs.faviconUrl as string | null;
  const status = node.attrs.status as string | null;

  const [urlDraft, setUrlDraft] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api.getLinkPreview(url as string),
    enabled: !!url && status === null,
  });

  useEffect(() => {
    if (data) {
      updateAttributes({
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        faviconUrl: data.faviconUrl,
        status: data.status,
      });
    }
    // updateAttributes is stable across renders for a given node instance; including it
    // would re-run this on every keystroke elsewhere in the doc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!url) {
    return (
      <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-2 dark:border-zinc-700" contentEditable={false}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (urlDraft) updateAttributes({ url: urlDraft });
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Paste a link…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
            Add
          </button>
        </form>
      </NodeViewWrapper>
    );
  }

  if (isFetching && status === null) {
    return (
      <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-3 text-xs text-zinc-400 dark:border-zinc-700" contentEditable={false}>
        Fetching preview…
      </NodeViewWrapper>
    );
  }

  // §29A.1 rule 4 — a failed fetch still renders as a plain link, never blank.
  if (status === 'error' || !title) {
    return (
      <NodeViewWrapper contentEditable={false} className="my-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate rounded border border-zinc-200 p-2 text-sm text-blue-600 hover:underline dark:border-zinc-700 dark:text-blue-400"
        >
          {url}
        </a>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false} className="my-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex overflow-hidden rounded border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <div className="min-w-0 flex-1 p-3">
          <p className="truncate text-sm font-medium">{title}</p>
          {description && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{description}</p>}
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
            {faviconUrl && <img src={faviconUrl} alt="" className="h-3.5 w-3.5" />}
            <span className="truncate">{url}</span>
          </div>
        </div>
        {imageUrl && <img src={imageUrl} alt="" className="w-32 shrink-0 object-cover" />}
      </a>
    </NodeViewWrapper>
  );
}

export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      imageUrl: { default: null },
      faviconUrl: { default: null },
      status: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView);
  },
});
