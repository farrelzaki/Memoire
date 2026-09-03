'use client';

import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { toast } from '@/stores/toast';

/** Curated, not Shiki's full ~200-language bundle — a code block only needs
 * to offer languages someone is actually likely to paste (§12B.1). Any value
 * Shiki recognizes still highlights correctly even if picked another way
 * (e.g. round-tripped from Markdown ```lang fences); this list only bounds
 * the dropdown. */
export const CODE_BLOCK_LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'bash',
  'shell',
  'css',
  'html',
  'sql',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'yaml',
  'markdown',
  'swift',
  'kotlin',
  'graphql',
  'dockerfile',
];

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string) || 'plaintext';
  const [wrap, setWrap] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(node.textContent);
    toast({ description: 'Code copied' });
  };

  return (
    <NodeViewWrapper className="my-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      <div
        contentEditable={false}
        className="flex items-center justify-between gap-2 bg-zinc-100 px-3 py-1 dark:bg-zinc-900"
      >
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          className="bg-transparent text-xs text-zinc-500 outline-none dark:text-zinc-400"
        >
          {CODE_BLOCK_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWrap((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            title="Toggle line wrap"
          >
            {wrap ? 'No wrap' : 'Wrap'}
          </button>
          <button
            onClick={copy}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            title="Copy code"
          >
            Copy
          </button>
        </div>
      </div>
      <pre
        className={`shiki-host m-0 bg-zinc-50 p-3 font-mono text-sm dark:bg-zinc-950 ${
          wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto whitespace-pre'
        }`}
      >
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

/** `@tiptap/extension-code-block` (not StarterKit's bundled copy — disabled
 * via `StarterKit.configure({ codeBlock: false })`) with a NodeView adding a
 * language picker / copy / wrap header. Syntax coloring itself is a separate
 * ProseMirror decoration plugin (`code-block-highlight.ts`) layered onto this
 * same `contentDOM` — decorations, not a second rendered copy of the text, so
 * typing still goes through ProseMirror's normal path. */
export const CodeBlockShiki = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
