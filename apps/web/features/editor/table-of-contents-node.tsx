'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';

type HeadingEntry = { pos: number; level: number; text: string };

/** Derived from the document's headings every render (§12B.3) — never stores anything itself. */
function TableOfContentsView({ editor }: NodeViewProps) {
  const [headings, setHeadings] = useState<HeadingEntry[]>(() => collectHeadings(editor));

  useEffect(() => {
    const update = () => setHeadings(collectHeadings(editor));
    update();
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);

  const scrollTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <NodeViewWrapper className="my-1 rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700" contentEditable={false}>
      {headings.length === 0 ? (
        <p className="text-zinc-400">No headings yet.</p>
      ) : (
        headings.map((h) => (
          <button
            key={h.pos}
            onClick={() => scrollTo(h.pos)}
            className="block w-full truncate py-0.5 text-left text-zinc-600 hover:underline dark:text-zinc-300"
            style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
          >
            {h.text || 'Untitled heading'}
          </button>
        ))
      )}
    </NodeViewWrapper>
  );
}

function collectHeadings(editor: NodeViewProps['editor']): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ pos, level: (node.attrs.level as number) ?? 1, text: node.textContent });
    }
  });
  return headings;
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-of-contents' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },
});
