'use client';

import { InputRule, mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { useState } from 'react';

function renderLatex(latex: string, displayMode: boolean): { html: string; error: boolean } {
  try {
    return { html: katex.renderToString(latex, { throwOnError: true, displayMode }), error: false };
  } catch {
    // Invalid LaTeX mid-edit is normal, not exceptional — show the raw
    // source rather than an error state that fights the user while typing.
    return { html: '', error: true };
  }
}

function EquationView({ node, updateAttributes, displayMode }: NodeViewProps & { displayMode: boolean }) {
  const latex = (node.attrs.latex as string) || '';
  const [editing, setEditing] = useState(latex.length === 0);
  const [draft, setDraft] = useState(latex);
  const { html, error } = renderLatex(latex, displayMode);

  const commit = () => {
    updateAttributes({ latex: draft });
    setEditing(false);
  };

  const Wrapper = displayMode ? 'div' : 'span';

  return (
    <NodeViewWrapper as={displayMode ? 'div' : 'span'} className={displayMode ? 'my-2' : undefined}>
      {editing ? (
        <input
          autoFocus
          contentEditable={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="LaTeX, e.g. E = mc^2"
          className={`rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 ${
            displayMode ? 'block w-full' : 'inline-block'
          }`}
        />
      ) : (
        <Wrapper
          contentEditable={false}
          onClick={() => {
            setDraft(latex);
            setEditing(true);
          }}
          className={`cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ${displayMode ? 'block px-2 py-1' : 'inline-block px-0.5'}`}
          title="Click to edit"
        >
          {error || !latex ? (
            <span className="font-mono text-sm text-zinc-400">{latex || '$ ... $'}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </Wrapper>
      )}
    </NodeViewWrapper>
  );
}

/** Block equation (§12B.1) — KaTeX display mode. Font/CSS self-hosted from
 * `public/katex/` (§29A), linked once in `app/layout.tsx`, never a CDN. */
export const Equation = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="equation"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'equation' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => <EquationView {...props} displayMode />);
  },
});

/** Inline equation (§12A.1) — a node atom, not a mark (an equation isn't a
 * style applied to existing text; it replaces the `$...$` typed for it,
 * matching the mention/emoji atom-node pattern rather than bold/italic). */
export const InlineEquation = Node.create({
  name: 'inlineEquation',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-equation"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-equation' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => <EquationView {...props} displayMode={false} />);
  },

  addInputRules() {
    return [
      // §12A.5 — `$x$` input rule for inline equations. Not `nodeInputRule`:
      // that helper only replaces the *captured group* (built for rules like
      // `@mention` where one trailing character triggered the match), so it
      // left both literal `$` delimiters behind as text — confirmed by hand.
      // A plain `InputRule` with `tr.replaceWith(range.from, range.to, …)`
      // consumes the whole matched span, delimiters included.
      new InputRule({
        find: /\$([^$]+)\$$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const latex = match[1];
          const node = this.type.create({ latex });
          tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },
});
