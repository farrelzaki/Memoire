'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';

/** Sandboxed iframe embed (§29A.2) — 16:9 fallback, reload affordance if it fails to load. */
function EmbedView({ node, updateAttributes }: NodeViewProps) {
  const url = node.attrs.url as string | null;
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const [urlDraft, setUrlDraft] = useState('');

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
            placeholder="Paste a link to embed…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
            Embed
          </button>
        </form>
      </NodeViewWrapper>
    );
  }

  if (failed) {
    return (
      <NodeViewWrapper
        className="my-1 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded border border-zinc-200 text-sm text-zinc-400 dark:border-zinc-700"
        contentEditable={false}
      >
        <p>Couldn&apos;t load embed.</p>
        <button
          onClick={() => {
            setFailed(false);
            setKey((k) => k + 1);
          }}
          className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800"
        >
          Reload
        </button>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="my-1" contentEditable={false}>
      <iframe
        key={key}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-video w-full rounded border border-zinc-200 dark:border-zinc-700"
      />
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { url: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embed' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});
