'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_CODE = 'graph TD;\n  A --> B;';

let mermaidSeq = 0;

/** Renders `code` to SVG client-side via the `mermaid` package — never touches the backend. */
function MermaidView({ node, updateAttributes, selected }: NodeViewProps) {
  const code = (node.attrs.code as string) ?? DEFAULT_CODE;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${(mermaidSeq += 1)}`);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;

    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      try {
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled && svgRef.current) {
          svgRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid diagram');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, editing]);

  return (
    <NodeViewWrapper
      className={`my-2 rounded border p-3 ${
        selected ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-200 dark:border-zinc-800'
      }`}
      contentEditable={false}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Mermaid</span>
        <button
          onClick={() => {
            if (editing) updateAttributes({ code: draft });
            else setDraft(code);
            setEditing((v) => !v);
          }}
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="w-full rounded border border-zinc-200 bg-transparent p-2 font-mono text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:text-zinc-200"
        />
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <div ref={svgRef} className="overflow-x-auto" />
      )}
    </NodeViewWrapper>
  );
}

export const MermaidBlock = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: { default: DEFAULT_CODE },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidView);
  },
});
