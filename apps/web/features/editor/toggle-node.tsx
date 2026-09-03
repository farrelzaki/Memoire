'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';

/**
 * Fold state (§12B.5): "open or closed" belongs to the view, not the
 * content, and is only relevant to one user on one device — localStorage
 * keyed by blockId, never `blocks.content`. Writing it there would mean
 * every open/close writes to the database and pollutes version history.
 */
function foldKey(blockId: string): string {
  return `memoire:toggle-open:${blockId}`;
}

/** Defaults to open (unlike a typical "collapsed by default" fold) — a
 * newly-created toggle has to start open, or its own contentEditable
 * children get `display: none`'d out from under the cursor the moment you
 * press Enter to add the first line of hidden detail (confirmed by hand: the
 * browser silently redirects typed input to the nearest visible node instead
 * of the actual, hidden selection). Only an explicit prior "close" persists. */
function readOpen(blockId: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(foldKey(blockId)) !== '0';
}

function writeOpen(blockId: string, open: boolean): void {
  window.localStorage.setItem(foldKey(blockId), open ? '1' : '0');
}

/** One node covers both "Toggle" and "Toggle heading 1-3" (§12B.1) —
 * `attrs.headingLevel` (null | 1 | 2 | 3) picks the typography for the first
 * (always-visible) child; the rest of the content folds. Mirrors how the
 * existing `heading` block type uses a single node + `attrs.level` instead
 * of three separate node types. */
function ToggleView({ node }: NodeViewProps) {
  const blockId = (node.attrs.blockId as string) || '';
  const headingLevel = node.attrs.headingLevel as number | null;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (blockId) setOpen(readOpen(blockId));
  }, [blockId]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (blockId) writeOpen(blockId, next);
      return next;
    });
  };

  // Full literal class strings (not interpolated) so Tailwind's JIT scanner
  // can actually see them — a dynamically-built `[&>*:first-child]:${x}`
  // string would never appear in source and silently produce no CSS.
  const summaryCls = {
    0: '',
    1: '[&>*:first-child]:text-2xl [&>*:first-child]:font-bold',
    2: '[&>*:first-child]:text-xl [&>*:first-child]:font-bold',
    3: '[&>*:first-child]:text-lg [&>*:first-child]:font-semibold',
  }[headingLevel ?? 0];

  return (
    <NodeViewWrapper className="my-1">
      <div className="flex items-start gap-1">
        <button
          contentEditable={false}
          onClick={toggle}
          className="mt-0.5 h-5 w-5 shrink-0 rounded text-xs text-muted-foreground hover:bg-muted"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? '▾' : '▸'}
        </button>
        <NodeViewContent
          className={`toggle-content min-w-0 flex-1 ${open ? 'toggle-content-open' : 'toggle-content-closed'} ${summaryCls}`}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  // `paragraph block*` (which would enforce "summary is always a paragraph"
  // at the schema level) breaks ProseMirror's Enter-to-split command inside
  // the node — confirmed by hand, splitting silently produced no line break
  // at all. Plain `block+` (same as `Callout`, which splits fine) works;
  // "first child is the summary" is enforced by the view/CSS, not the schema.
  content: 'block+',
  draggable: true,

  addAttributes() {
    return {
      headingLevel: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        'data-heading-level': node.attrs.headingLevel ?? undefined,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
