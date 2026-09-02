import type { AnyExtension } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import type { TiptapNode } from '@/lib/types';
import { MermaidBlock } from './mermaid-node';

/**
 * Sprint 13 (§11D.2): the registry every editor-facing consumer reads from —
 * slash menu, block menu, turn-into, paste-markdown, HTML/Markdown export,
 * the print route, and search snippet extraction. `toHtml`/`toMarkdown`/
 * `toPlainText` are required fields on the type itself so a new block type
 * cannot compile without its export path (§12B.6, ADR in §96-decisions.md).
 */
export interface BlockTypeDefinition {
  key: string;
  label: string;
  icon: string;
  group: 'basic' | 'media' | 'advanced' | 'database';
  keywords: string[];
  /** StarterKit bundles several node types into one extension instance — entries that share it point at the same object. */
  tiptapExtension: AnyExtension;
  slashCommand?: { title: string; description: string };
  turnIntoTargets?: string[];
  inputRule?: RegExp;
  toHtml(node: TiptapNode): string;
  toMarkdown(node: TiptapNode): string;
  toPlainText(node: TiptapNode): string;
}

class BlockTypeRegistryClass {
  private readonly types = new Map<string, BlockTypeDefinition>();

  register(def: BlockTypeDefinition): this {
    this.types.set(def.key, def);
    return this;
  }

  get(key: string): BlockTypeDefinition | undefined {
    return this.types.get(key);
  }

  list(): BlockTypeDefinition[] {
    return [...this.types.values()];
  }
}

export const BlockTypeRegistry = new BlockTypeRegistryClass();

// ---------------------------------------------------------------------------
// Shared inline (text-run) serialization — every block type below composes
// these instead of re-walking marks itself.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineToHtml(nodes: TiptapNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '<br>';
      if (n.type !== 'text') return '';
      let html = escapeHtml(n.text ?? '');
      for (const mark of n.marks ?? []) {
        switch (mark.type) {
          case 'bold':
            html = `<strong>${html}</strong>`;
            break;
          case 'italic':
            html = `<em>${html}</em>`;
            break;
          case 'code':
            html = `<code>${html}</code>`;
            break;
          case 'strike':
            html = `<s>${html}</s>`;
            break;
        }
      }
      return html;
    })
    .join('');
}

function inlineToMarkdown(nodes: TiptapNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '\n';
      if (n.type !== 'text') return '';
      let md = n.text ?? '';
      for (const mark of n.marks ?? []) {
        switch (mark.type) {
          case 'bold':
            md = `**${md}**`;
            break;
          case 'italic':
            md = `*${md}*`;
            break;
          case 'code':
            md = `\`${md}\``;
            break;
          case 'strike':
            md = `~~${md}~~`;
            break;
        }
      }
      return md;
    })
    .join('');
}

function inlineToPlainText(nodes: TiptapNode[] = []): string {
  return nodes.map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('');
}

// ---------------------------------------------------------------------------
// Container serialization — delegates to a child's own registry entry when
// it has one (list items, nested lists), falling back to inline text.

function childToHtml(node: TiptapNode): string {
  return BlockTypeRegistry.get(node.type ?? '')?.toHtml(node) ?? inlineToHtml(node.content);
}

function childToMarkdown(node: TiptapNode): string {
  return BlockTypeRegistry.get(node.type ?? '')?.toMarkdown(node) ?? inlineToMarkdown(node.content);
}

function childToPlainText(node: TiptapNode): string {
  return (
    BlockTypeRegistry.get(node.type ?? '')?.toPlainText(node) ?? inlineToPlainText(node.content)
  );
}

// ---------------------------------------------------------------------------
// Registrations — the block types already wired into the editor
// (`document-editor.tsx`'s extension list / `block-id.ts#BLOCK_ID_TYPES`).
// The other ~13 types in the §12B catalogue land in Sprint 16/17.

BlockTypeRegistry.register({
  key: 'paragraph',
  label: 'Text',
  icon: '📝',
  group: 'basic',
  keywords: ['text', 'paragraph'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Text', description: 'Just start writing with plain text' },
  turnIntoTargets: ['heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'],
  toHtml: (node) => `<p>${inlineToHtml(node.content)}</p>`,
  toMarkdown: (node) => inlineToMarkdown(node.content),
  toPlainText: (node) => inlineToPlainText(node.content),
});

BlockTypeRegistry.register({
  key: 'heading',
  label: 'Heading',
  icon: '#',
  group: 'basic',
  keywords: ['heading', 'title', 'h1', 'h2', 'h3'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Heading', description: 'Big section heading' },
  turnIntoTargets: ['paragraph'],
  inputRule: /^(#{1,3})\s$/,
  toHtml: (node) => {
    const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
    return `<h${level}>${inlineToHtml(node.content)}</h${level}>`;
  },
  toMarkdown: (node) => {
    const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
    return `${'#'.repeat(level)} ${inlineToMarkdown(node.content)}`;
  },
  toPlainText: (node) => inlineToPlainText(node.content),
});

BlockTypeRegistry.register({
  key: 'bulletList',
  label: 'Bulleted list',
  icon: '•',
  group: 'basic',
  keywords: ['bullet', 'list', 'ul'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Bulleted list', description: 'Create a simple bulleted list' },
  inputRule: /^[-*]\s$/,
  toHtml: (node) => `<ul>${(node.content ?? []).map(childToHtml).join('')}</ul>`,
  toMarkdown: (node) =>
    (node.content ?? []).map((li) => `- ${childToMarkdown(li)}`).join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'orderedList',
  label: 'Numbered list',
  icon: '1.',
  group: 'basic',
  keywords: ['numbered', 'list', 'ol'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Numbered list', description: 'Create a list with numbering' },
  inputRule: /^1\.\s$/,
  toHtml: (node) => `<ol>${(node.content ?? []).map(childToHtml).join('')}</ol>`,
  toMarkdown: (node) =>
    (node.content ?? []).map((li, i) => `${i + 1}. ${childToMarkdown(li)}`).join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'listItem',
  label: 'List item',
  icon: '•',
  group: 'basic',
  keywords: [],
  tiptapExtension: StarterKit,
  toHtml: (node) => `<li>${(node.content ?? []).map(childToHtml).join('')}</li>`,
  toMarkdown: (node) => (node.content ?? []).map(childToMarkdown).join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join(' '),
});

BlockTypeRegistry.register({
  key: 'blockquote',
  label: 'Quote',
  icon: '❝',
  group: 'basic',
  keywords: ['quote', 'blockquote'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Quote', description: 'Capture a quote' },
  turnIntoTargets: ['paragraph'],
  inputRule: /^>\s$/,
  toHtml: (node) => `<blockquote>${(node.content ?? []).map(childToHtml).join('')}</blockquote>`,
  toMarkdown: (node) =>
    (node.content ?? [])
      .map(childToMarkdown)
      .join('\n')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'codeBlock',
  label: 'Code',
  icon: '</>',
  group: 'basic',
  keywords: ['code', 'codeblock', 'snippet'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Code', description: 'Capture a code snippet' },
  turnIntoTargets: ['paragraph'],
  inputRule: /^```$/,
  toHtml: (node) => {
    const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
    const text = inlineToPlainText(node.content);
    return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`;
  },
  toMarkdown: (node) => {
    const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
    return `\`\`\`${language}\n${inlineToPlainText(node.content)}\n\`\`\``;
  },
  toPlainText: (node) => inlineToPlainText(node.content),
});

BlockTypeRegistry.register({
  key: 'horizontalRule',
  label: 'Divider',
  icon: '—',
  group: 'basic',
  keywords: ['divider', 'hr', 'line'],
  tiptapExtension: StarterKit,
  slashCommand: { title: 'Divider', description: 'Visually divide blocks' },
  inputRule: /^---$/,
  toHtml: () => '<hr>',
  toMarkdown: () => '---',
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'taskList',
  label: 'To-do list',
  icon: '☑',
  group: 'basic',
  keywords: ['todo', 'task', 'checkbox'],
  tiptapExtension: TaskList,
  slashCommand: { title: 'To-do list', description: 'Track tasks with a to-do list' },
  inputRule: /^\[\s?\]\s$/,
  toHtml: (node) => `<ul data-type="taskList">${(node.content ?? []).map(childToHtml).join('')}</ul>`,
  toMarkdown: (node) => (node.content ?? []).map(childToMarkdown).join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'taskItem',
  label: 'To-do item',
  icon: '☐',
  group: 'basic',
  keywords: [],
  tiptapExtension: TaskItem,
  toHtml: (node) => {
    const checked = node.attrs?.checked === true;
    return `<li data-checked="${checked}"><input type="checkbox" ${checked ? 'checked' : ''} disabled>${(
      node.content ?? []
    )
      .map(childToHtml)
      .join('')}</li>`;
  },
  toMarkdown: (node) => {
    const checked = node.attrs?.checked === true;
    return `[${checked ? 'x' : ' '}] ${(node.content ?? []).map(childToMarkdown).join(' ')}`;
  },
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join(' '),
});

BlockTypeRegistry.register({
  key: 'image',
  label: 'Image',
  icon: '🖼',
  group: 'media',
  keywords: ['image', 'photo', 'picture', 'upload'],
  tiptapExtension: Image,
  slashCommand: { title: 'Image', description: 'Upload or embed with a link' },
  toHtml: (node) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  },
  toMarkdown: (node) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    return `![${alt}](${src})`;
  },
  toPlainText: (node) => (typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''),
});

BlockTypeRegistry.register({
  key: 'mermaid',
  label: 'Mermaid diagram',
  icon: '🧭',
  group: 'advanced',
  keywords: ['mermaid', 'diagram', 'flowchart'],
  tiptapExtension: MermaidBlock,
  slashCommand: { title: 'Mermaid', description: 'Diagram from Mermaid syntax' },
  toHtml: (node) => `<pre class="mermaid">${escapeHtml((node.attrs?.code as string) ?? '')}</pre>`,
  toMarkdown: (node) => `\`\`\`mermaid\n${(node.attrs?.code as string) ?? ''}\n\`\`\``,
  toPlainText: (node) => (node.attrs?.code as string) ?? '',
});
