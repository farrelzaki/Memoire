import type { AnyExtension } from '@tiptap/core';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import { attachmentContentUrl } from '@/lib/api';
import type { TiptapNode } from '@/lib/types';
import { Callout } from './callout-node';
import { Column, Columns } from './columns-node';
import { Bookmark } from './bookmark-node';
import { Breadcrumb } from './breadcrumb-node';
import { Embed } from './embed-node';
import { Equation } from './equation-node';
import { CodeBlockShiki } from './code-block-node';
import { ImageBlock } from './image-node';
import { LinkToPage } from './link-to-page-node';
import { AudioBlock, FileBlock, PdfBlock, VideoBlock } from './media-nodes';
import { MermaidBlock } from './mermaid-node';
import { SubPage } from './sub-page-node';
import { SyncedBlock } from './synced-block-node';
import { TableOfContents } from './table-of-contents-node';
import { Toggle } from './toggle-node';

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

/** Sum of `toPlainText` word counts across a page's top-level blocks (§71.8 "hitung kata"). Purely derived — never stored. */
export function countWords(blocks: Array<{ type: string; content: TiptapNode | null }>): number {
  let total = 0;
  for (const block of blocks) {
    const text = block.content ? BlockTypeRegistry.get(block.type)?.toPlainText(block.content) : '';
    if (!text) continue;
    total += text.trim().split(/\s+/).filter(Boolean).length;
  }
  return total;
}

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
      if (n.type === 'inlineEquation') {
        return `<span data-type="inline-equation">$${escapeHtml((n.attrs?.latex as string) ?? '')}$</span>`;
      }
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
          case 'underline':
            html = `<u>${html}</u>`;
            break;
          case 'subscript':
            html = `<sub>${html}</sub>`;
            break;
          case 'superscript':
            html = `<sup>${html}</sup>`;
            break;
          case 'highlight': {
            const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
            const color = typeof attrs.color === 'string' ? attrs.color : undefined;
            html = color
              ? `<mark style="background-color: ${color}; color: inherit">${html}</mark>`
              : `<mark>${html}</mark>`;
            break;
          }
          case 'textStyle': {
            const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
            const color = typeof attrs.color === 'string' ? attrs.color : undefined;
            if (color) html = `<span style="color: ${color}">${html}</span>`;
            break;
          }
          case 'link': {
            const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
            const href = typeof attrs.href === 'string' ? attrs.href : '';
            const external = href.startsWith('http');
            html = `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${html}</a>`;
            break;
          }
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
      if (n.type === 'inlineEquation') return `$${(n.attrs?.latex as string) ?? ''}$`;
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
          case 'highlight':
            md = `==${md}==`;
            break;
          case 'link': {
            const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
            const href = typeof attrs.href === 'string' ? attrs.href : '';
            md = `[${md}](${href})`;
            break;
          }
          // underline/subscript/superscript/textStyle have no plain-Markdown
          // equivalent (§12A.5 only lists syntax for the marks above) — the
          // text itself still round-trips, just without the formatting.
        }
      }
      return md;
    })
    .join('');
}

function inlineToPlainText(nodes: TiptapNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '\n';
      if (n.type === 'inlineEquation') return (n.attrs?.latex as string) ?? '';
      return n.text ?? '';
    })
    .join('');
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
  tiptapExtension: CodeBlockShiki,
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
  tiptapExtension: ImageBlock,
  slashCommand: { title: 'Image', description: 'Upload or embed with a link' },
  toHtml: (node) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    const width = typeof node.attrs?.width === 'number' ? node.attrs.width : undefined;
    const align = typeof node.attrs?.align === 'string' ? node.attrs.align : 'center';
    const fullBleed = node.attrs?.fullBleed === true;
    const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : '';

    let style = '';
    if (fullBleed) {
      style = 'width:100%';
    } else if (width || align !== 'center') {
      style = `display:block;margin-left:${align === 'right' ? 'auto' : '0'};margin-right:${align === 'left' ? 'auto' : '0'}${width ? `;width:${width}px` : ''}`;
    }

    const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${style ? ` style="${style}"` : ''}>`;
    return caption ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>` : img;
  },
  toMarkdown: (node) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
    const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : '';
    const image = `![${alt}](${src})`;
    return caption ? `${image}\n*${caption}*` : image;
  },
  toPlainText: (node) => {
    const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : '';
    return caption || (typeof node.attrs?.alt === 'string' ? node.attrs.alt : '');
  },
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

BlockTypeRegistry.register({
  key: 'callout',
  label: 'Callout',
  icon: '💡',
  group: 'basic',
  keywords: ['callout', 'note', 'info', 'warning'],
  tiptapExtension: Callout,
  slashCommand: { title: 'Callout', description: 'Make writing stand out' },
  toHtml: (node) => {
    const icon = typeof node.attrs?.icon === 'string' ? node.attrs.icon : '💡';
    return `<div data-type="callout"><span>${escapeHtml(icon)}</span><div>${(node.content ?? [])
      .map(childToHtml)
      .join('')}</div></div>`;
  },
  toMarkdown: (node) => {
    const icon = typeof node.attrs?.icon === 'string' ? node.attrs.icon : '💡';
    const body = (node.content ?? []).map(childToMarkdown).join('\n');
    return `> ${icon} ${body.split('\n').join('\n> ')}`;
  },
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'toggle',
  label: 'Toggle',
  icon: '▸',
  group: 'basic',
  keywords: ['toggle', 'collapse', 'fold', 'expand', 'heading'],
  tiptapExtension: Toggle,
  slashCommand: { title: 'Toggle list', description: 'Collapsible content' },
  toHtml: (node) => {
    const [summary, ...rest] = node.content ?? [];
    const summaryHtml = summary ? inlineToHtml(summary.content) : '';
    const restHtml = rest.map(childToHtml).join('');
    return `<details><summary>${summaryHtml}</summary>${restHtml}</details>`;
  },
  toMarkdown: (node) => {
    const level = typeof node.attrs?.headingLevel === 'number' ? node.attrs.headingLevel : 0;
    const [summary, ...rest] = node.content ?? [];
    const summaryMd = summary ? inlineToMarkdown(summary.content) : '';
    const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';
    const restMd = rest.map(childToMarkdown).join('\n');
    return [`${prefix}${summaryMd}`, restMd].filter(Boolean).join('\n');
  },
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

function cellPlainText(cell: TiptapNode): string {
  return (cell.content ?? []).map(childToPlainText).join(' ');
}

BlockTypeRegistry.register({
  key: 'table',
  label: 'Table',
  icon: '▦',
  group: 'basic',
  keywords: ['table', 'grid', 'spreadsheet'],
  tiptapExtension: Table,
  slashCommand: { title: 'Table', description: 'A simple table, not a database' },
  toHtml: (node) => `<table>${(node.content ?? []).map(childToHtml).join('')}</table>`,
  toMarkdown: (node) => {
    const rows = node.content ?? [];
    if (rows.length === 0) return '';
    const cellsOf = (row: TiptapNode) => (row.content ?? []).map(cellPlainText);
    const header = cellsOf(rows[0]);
    const separator = header.map(() => '---');
    const body = rows.slice(1).map(cellsOf);
    const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
    return [toRow(header), toRow(separator), ...body.map(toRow)].join('\n');
  },
  toPlainText: (node) =>
    (node.content ?? [])
      .map((row) => (row.content ?? []).map(cellPlainText).join('\t'))
      .join('\n'),
});

BlockTypeRegistry.register({
  key: 'tableRow',
  label: 'Table row',
  icon: '▦',
  group: 'basic',
  keywords: [],
  tiptapExtension: TableRow,
  toHtml: (node) => `<tr>${(node.content ?? []).map(childToHtml).join('')}</tr>`,
  toMarkdown: (node) => `| ${(node.content ?? []).map(cellPlainText).join(' | ')} |`,
  toPlainText: (node) => (node.content ?? []).map(cellPlainText).join('\t'),
});

BlockTypeRegistry.register({
  key: 'tableHeader',
  label: 'Table header cell',
  icon: '▦',
  group: 'basic',
  keywords: [],
  tiptapExtension: TableHeader,
  toHtml: (node) => `<th>${(node.content ?? []).map(childToHtml).join('')}</th>`,
  toMarkdown: cellPlainText,
  toPlainText: cellPlainText,
});

BlockTypeRegistry.register({
  key: 'tableCell',
  label: 'Table cell',
  icon: '▦',
  group: 'basic',
  keywords: [],
  tiptapExtension: TableCell,
  toHtml: (node) => `<td>${(node.content ?? []).map(childToHtml).join('')}</td>`,
  toMarkdown: cellPlainText,
  toPlainText: cellPlainText,
});

BlockTypeRegistry.register({
  key: 'columns',
  label: 'Columns',
  icon: '▥',
  group: 'basic',
  keywords: ['columns', 'layout', 'side by side'],
  tiptapExtension: Columns,
  slashCommand: { title: 'Columns', description: 'Side-by-side content' },
  toHtml: (node) => `<div data-type="columns">${(node.content ?? []).map(childToHtml).join('')}</div>`,
  // No Markdown equivalent for a side-by-side layout — each column's content
  // still round-trips, one after another, just no longer side by side.
  toMarkdown: (node) => (node.content ?? []).map(childToMarkdown).join('\n\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'column',
  label: 'Column',
  icon: '▥',
  group: 'basic',
  keywords: [],
  tiptapExtension: Column,
  toHtml: (node) => `<div data-type="column">${(node.content ?? []).map(childToHtml).join('')}</div>`,
  toMarkdown: (node) => (node.content ?? []).map(childToMarkdown).join('\n'),
  toPlainText: (node) => (node.content ?? []).map(childToPlainText).join('\n'),
});

BlockTypeRegistry.register({
  key: 'subPage',
  label: 'Page',
  icon: '📄',
  group: 'advanced',
  keywords: ['subpage', 'page', 'child page'],
  tiptapExtension: SubPage,
  slashCommand: { title: 'Page', description: 'Create a child page inline' },
  toHtml: (node) => {
    const pageId = typeof node.attrs?.pageId === 'string' ? node.attrs.pageId : '';
    return pageId ? `<a href="/${pageId}" data-type="sub-page">📄 Page</a>` : '';
  },
  toMarkdown: (node) => {
    const pageId = typeof node.attrs?.pageId === 'string' ? node.attrs.pageId : '';
    return pageId ? `[📄 Page](/${pageId})` : '';
  },
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'linkToPage',
  label: 'Link to page',
  icon: '🔗',
  group: 'advanced',
  keywords: ['link', 'page', 'reference'],
  tiptapExtension: LinkToPage,
  slashCommand: { title: 'Link to page', description: 'Link to an existing page' },
  toHtml: (node) => {
    const pageId = typeof node.attrs?.pageId === 'string' ? node.attrs.pageId : '';
    return pageId ? `<a href="/${pageId}" data-type="link-to-page">🔗 Page</a>` : '';
  },
  toMarkdown: (node) => {
    const pageId = typeof node.attrs?.pageId === 'string' ? node.attrs.pageId : '';
    return pageId ? `[🔗 Page](/${pageId})` : '';
  },
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'breadcrumb',
  label: 'Breadcrumb',
  icon: '🧭',
  group: 'advanced',
  keywords: ['breadcrumb', 'trail', 'navigation'],
  tiptapExtension: Breadcrumb,
  slashCommand: { title: 'Breadcrumb', description: "This page's ancestor trail" },
  toHtml: () => '<nav data-type="breadcrumb"></nav>',
  toMarkdown: () => '',
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'tableOfContents',
  label: 'Table of contents',
  icon: '📑',
  group: 'advanced',
  keywords: ['toc', 'table of contents', 'outline'],
  tiptapExtension: TableOfContents,
  slashCommand: { title: 'Table of contents', description: 'Outline of headings on this page' },
  toHtml: () => '<nav data-type="table-of-contents"></nav>',
  toMarkdown: () => '',
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'syncedBlock',
  label: 'Synced block',
  icon: '🔁',
  group: 'advanced',
  keywords: ['synced', 'sync', 'reuse', 'duplicate'],
  tiptapExtension: SyncedBlock,
  slashCommand: { title: 'Synced block', description: 'Content reused and kept in sync elsewhere' },
  toHtml: (node) => {
    if (node.attrs?.sourceBlockId) return '<div data-type="synced-block">Synced content</div>';
    return `<div data-type="synced-block">${(node.content ?? []).map(childToHtml).join('')}</div>`;
  },
  toMarkdown: (node) => {
    if (node.attrs?.sourceBlockId) return '';
    return (node.content ?? []).map(childToMarkdown).join('\n');
  },
  toPlainText: (node) => {
    if (node.attrs?.sourceBlockId) return '';
    return (node.content ?? []).map(childToPlainText).join('\n');
  },
});

function mediaSrc(node: TiptapNode): string {
  const attachmentId = typeof node.attrs?.attachmentId === 'string' ? node.attrs.attachmentId : null;
  if (attachmentId) return attachmentContentUrl(attachmentId);
  return typeof node.attrs?.url === 'string' ? node.attrs.url : '';
}

function mediaFilename(node: TiptapNode): string {
  return typeof node.attrs?.filename === 'string' ? node.attrs.filename : '';
}

BlockTypeRegistry.register({
  key: 'fileBlock',
  label: 'File',
  icon: '📎',
  group: 'media',
  keywords: ['file', 'attachment', 'download'],
  tiptapExtension: FileBlock,
  slashCommand: { title: 'File', description: 'Upload or embed a file' },
  toHtml: (node) => {
    const src = mediaSrc(node);
    const filename = mediaFilename(node);
    return src ? `<a href="${escapeHtml(src)}">${escapeHtml(filename || 'Download file')}</a>` : '';
  },
  toMarkdown: (node) => {
    const src = mediaSrc(node);
    return src ? `[${mediaFilename(node) || 'Download file'}](${src})` : '';
  },
  toPlainText: (node) => mediaFilename(node),
});

BlockTypeRegistry.register({
  key: 'video',
  label: 'Video',
  icon: '🎬',
  group: 'media',
  keywords: ['video', 'movie', 'clip'],
  tiptapExtension: VideoBlock,
  slashCommand: { title: 'Video', description: 'Upload or embed a video' },
  toHtml: (node) => {
    const src = mediaSrc(node);
    return src ? `<video src="${escapeHtml(src)}" controls></video>` : '';
  },
  toMarkdown: (node) => {
    const src = mediaSrc(node);
    return src ? `[${mediaFilename(node) || 'Video'}](${src})` : '';
  },
  toPlainText: (node) => mediaFilename(node),
});

BlockTypeRegistry.register({
  key: 'audio',
  label: 'Audio',
  icon: '🎵',
  group: 'media',
  keywords: ['audio', 'music', 'sound'],
  tiptapExtension: AudioBlock,
  slashCommand: { title: 'Audio', description: 'Upload or embed an audio clip' },
  toHtml: (node) => {
    const src = mediaSrc(node);
    return src ? `<audio src="${escapeHtml(src)}" controls></audio>` : '';
  },
  toMarkdown: (node) => {
    const src = mediaSrc(node);
    return src ? `[${mediaFilename(node) || 'Audio'}](${src})` : '';
  },
  toPlainText: (node) => mediaFilename(node),
});

BlockTypeRegistry.register({
  key: 'pdf',
  label: 'PDF',
  icon: '📕',
  group: 'media',
  keywords: ['pdf', 'document'],
  tiptapExtension: PdfBlock,
  slashCommand: { title: 'PDF', description: 'Upload or embed a PDF' },
  toHtml: (node) => {
    const src = mediaSrc(node);
    return src ? `<iframe src="${escapeHtml(src)}"></iframe>` : '';
  },
  toMarkdown: (node) => {
    const src = mediaSrc(node);
    return src ? `[${mediaFilename(node) || 'PDF'}](${src})` : '';
  },
  toPlainText: (node) => mediaFilename(node),
});

BlockTypeRegistry.register({
  key: 'bookmark',
  label: 'Bookmark',
  icon: '🔖',
  group: 'media',
  keywords: ['bookmark', 'link', 'preview'],
  tiptapExtension: Bookmark,
  slashCommand: { title: 'Bookmark', description: 'Visual preview of a link' },
  toHtml: (node) => {
    const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
    if (!url) return '';
    const title = typeof node.attrs?.title === 'string' ? node.attrs.title : url;
    return `<a href="${escapeHtml(url)}" data-type="bookmark">${escapeHtml(title)}</a>`;
  },
  toMarkdown: (node) => {
    const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
    if (!url) return '';
    const title = typeof node.attrs?.title === 'string' ? node.attrs.title : url;
    return `[${title}](${url})`;
  },
  toPlainText: (node) => (typeof node.attrs?.title === 'string' ? node.attrs.title : (node.attrs?.url as string) ?? ''),
});

BlockTypeRegistry.register({
  key: 'embed',
  label: 'Embed',
  icon: '🖥',
  group: 'media',
  keywords: ['embed', 'iframe'],
  tiptapExtension: Embed,
  slashCommand: { title: 'Embed', description: 'Embed a website' },
  toHtml: (node) => {
    const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
    return url
      ? `<iframe src="${escapeHtml(url)}" sandbox="allow-scripts allow-same-origin allow-popups" referrerpolicy="no-referrer" loading="lazy"></iframe>`
      : '';
  },
  toMarkdown: (node) => {
    const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
    return url ? `[Embed](${url})` : '';
  },
  toPlainText: () => '',
});

BlockTypeRegistry.register({
  key: 'equation',
  label: 'Equation',
  icon: '∑',
  group: 'advanced',
  keywords: ['equation', 'math', 'katex', 'formula'],
  tiptapExtension: Equation,
  slashCommand: { title: 'Equation', description: 'Block equation (KaTeX)' },
  toHtml: (node) => `<div data-type="equation">$$${escapeHtml((node.attrs?.latex as string) ?? '')}$$</div>`,
  toMarkdown: (node) => `$$${(node.attrs?.latex as string) ?? ''}$$`,
  toPlainText: (node) => (node.attrs?.latex as string) ?? '',
});
