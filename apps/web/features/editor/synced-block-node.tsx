'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BlockTypeRegistry } from './block-type-registry';

/**
 * A copy renders the source block's content live from the server (§12B.4) —
 * it never duplicates content into its own `blocks.content`, so there's
 * nothing to keep in sync when the source changes.
 */
function SyncedBlockView({ node, updateAttributes }: NodeViewProps) {
  const sourceBlockId = node.attrs.sourceBlockId as string | null;

  const { data: source, isError, isLoading } = useQuery({
    queryKey: ['block', sourceBlockId],
    queryFn: () => api.getBlock(sourceBlockId as string),
    enabled: !!sourceBlockId,
    retry: false,
  });

  if (sourceBlockId) {
    if (isLoading) {
      return (
        <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-2 text-xs text-zinc-400 dark:border-zinc-700" contentEditable={false}>
          Loading synced content…
        </NodeViewWrapper>
      );
    }
    if (isError || !source?.content) {
      return (
        <NodeViewWrapper className="my-1 rounded border border-dashed border-zinc-300 p-2 text-sm text-zinc-400 dark:border-zinc-600" contentEditable={false}>
          <p>Source block was deleted.</p>
          <button
            onClick={() => updateAttributes({ sourceBlockId: null })}
            className="mt-1 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Detach into a regular block
          </button>
        </NodeViewWrapper>
      );
    }

    const html = BlockTypeRegistry.get(source.type)?.toHtml(source.content) ?? '';
    return (
      <NodeViewWrapper
        className="my-1 rounded border border-zinc-100 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40"
        contentEditable={false}
      >
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-400">Synced</span>
        {/* Read-only preview of the source — editing happens at the source block only. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </NodeViewWrapper>
    );
  }

  const blockId = node.attrs.blockId as string | undefined;

  return (
    <NodeViewWrapper className="my-1 rounded border border-zinc-100 p-2 dark:border-zinc-800" contentEditable={false}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Synced</span>
        {blockId && (
          <button
            onClick={() => void navigator.clipboard.writeText(blockId)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            Copy id
          </button>
        )}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const SyncedBlock = Node.create({
  name: 'syncedBlock',
  group: 'block',
  content: 'block*',
  draggable: true,

  addAttributes() {
    return { sourceBlockId: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="synced-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'synced-block' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SyncedBlockView);
  },
});
