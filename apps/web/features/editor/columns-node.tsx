'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useRef } from 'react';

const MIN_WIDTH_PCT = 10;

/** Draggable divider on a column's right edge, resizing this column and its
 * immediate next sibling in tandem (their widths always sum to what they
 * started with, so the row never overflows or leaves a gap). Rendered
 * outside `NodeViewContent` — same "overlay positioned off real DOM rects,
 * not inside the ProseMirror content" pattern as the drop indicator / gutter
 * in `document-editor.tsx`, just local to this node instead of the whole
 * editor. */
function ColumnView({ node, editor, getPos }: NodeViewProps) {
  const width = typeof node.attrs.width === 'number' ? (node.attrs.width as number) : null;
  const wrapperRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    if (index >= parent.childCount - 1) return; // last column has nothing to its right to trade width with

    const containerWidth = wrapperRef.current?.parentElement?.getBoundingClientRect().width || 1;
    const columnWidth = (i: number) => {
      const attrWidth = parent.child(i).attrs.width;
      return typeof attrWidth === 'number' ? attrWidth : 100 / parent.childCount;
    };
    const startThis = columnWidth(index);
    const startNext = columnWidth(index + 1);
    const thisPos = pos;
    const nextPos = pos + node.nodeSize;
    const startX = e.clientX;

    const onMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientX - startX) / containerWidth) * 100;
      const newThis = Math.max(MIN_WIDTH_PCT, Math.min(startThis + startNext - MIN_WIDTH_PCT, startThis + deltaPct));
      const newNext = startThis + startNext - newThis;
      const tr = editor.state.tr;
      tr.setNodeAttribute(thisPos, 'width', newThis);
      tr.setNodeAttribute(nextPos, 'width', newNext);
      editor.view.dispatch(tr);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="relative min-w-0"
      style={width ? { flex: `0 0 ${width}%`, maxWidth: `${width}%` } : { flex: '1 1 0%' }}
    >
      <NodeViewContent className="min-w-0" />
      <div
        contentEditable={false}
        onMouseDown={startResize}
        title="Drag to resize"
        className="absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize"
      />
    </NodeViewWrapper>
  );
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,

  addAttributes() {
    return {
      width: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView);
  },
});

/** Columns (§12B.1): 2 to 5 side-by-side `column`s, width draggable. The
 * `column{2,5}` content expression enforces the count at the schema level —
 * ProseMirror itself refuses an edit that would leave fewer than 2 or more
 * than 5. */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,5}',
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns', class: 'flex gap-4' }), 0];
  },
});
