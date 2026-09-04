/**
 * Minimal Tiptap JSON node shape (mirrors `apps/web/lib/types.ts`'s
 * `TiptapNode` — not imported directly since the frontend package isn't a
 * backend dependency, same boundary ADR-24 already drew for
 * `BlockTypeRegistry`).
 */
export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/**
 * Markdown → Tiptap-JSON parser for import (§30A, Sprint 24) — hand-rolled,
 * scoped exactly to what `BlockTypeRegistry.toMarkdown` already emits
 * (`apps/web/features/editor/block-type-registry.ts`), so a page exported
 * as Markdown and re-imported round-trips. Backend-only: `toMarkdown` is
 * frontend-only (ADR-24), so this is a second, symmetric implementation of
 * the same syntax rather than a shared module — deliberate, see ADR-25.
 *
 * Returns one root `TiptapNode` per top-level Markdown block, matching the
 * shape `apps/web/lib/blocks.ts`'s `docToBlocks` produces (one DB block row
 * per top-level node) — the import service assigns `blockId`/ids when it
 * writes these to the database, not this pure function.
 */
export function parseMarkdownToBlocks(markdown: string): TiptapNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const groups = splitIntoGroups(lines);
  return groups.map(parseGroup).filter((n): n is TiptapNode => n !== null);
}

/** Blank-line-separated groups of lines, EXCEPT a fenced code block stays one group regardless of blank lines inside it. */
function splitIntoGroups(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const isFenceMarker = /^```/.test(line.trim());
    if (isFenceMarker) inFence = !inFence;

    if (!inFence && line.trim() === '') {
      if (current.length > 0) groups.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function paragraphNode(text: string): TiptapNode {
  return { type: 'paragraph', content: parseInline(text) };
}

/** Unrecognized constructs wrap the original source as a code block rather than dropping it (§30A.3). */
function rawFallback(lines: string[]): TiptapNode {
  return { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: lines.join('\n') }] };
}

function parseGroup(lines: string[]): TiptapNode | null {
  if (lines.length === 0) return null;
  const first = lines[0];

  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(first);
  if (headingMatch && lines.length === 1) {
    return { type: 'heading', attrs: { level: headingMatch[1].length }, content: parseInline(headingMatch[2]) };
  }

  if (/^```/.test(first.trim())) {
    return parseCodeBlock(lines);
  }

  if (lines.length === 1 && /^(---|\*\*\*|___)$/.test(first.trim())) {
    return { type: 'horizontalRule' };
  }

  const imageMatch = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(first.trim());
  if (lines.length === 1 && imageMatch) {
    return { type: 'image', attrs: { src: imageMatch[2], alt: imageMatch[1] } };
  }

  if (lines.every((l) => /^>\s?/.test(l))) {
    const inner = lines.map((l) => l.replace(/^>\s?/, ''));
    return { type: 'blockquote', content: [paragraphNode(inner.join(' '))] };
  }

  if (lines.every((l) => TASK_ITEM_PATTERN.test(l))) {
    return parseTaskList(lines);
  }

  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return parseBulletList(lines);
  }

  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return parseOrderedList(lines);
  }

  if (lines.length >= 2 && lines.every((l) => /^\|.*\|$/.test(l.trim())) && /^\|[\s:|-]+\|$/.test(lines[1].trim())) {
    return parseTable(lines);
  }

  // A raw HTML block (or any other construct this parser doesn't recognize)
  // — preserve the original source rather than mangling or dropping it (§30A.3).
  if (/^</.test(first.trim())) {
    return rawFallback(lines);
  }

  return paragraphNode(lines.join(' '));
}

function parseCodeBlock(lines: string[]): TiptapNode {
  const language = lines[0].trim().replace(/^```/, '');
  const body = lines.slice(1, lines[lines.length - 1].trim() === '```' ? -1 : undefined);
  return {
    type: 'codeBlock',
    attrs: { language },
    content: body.length > 0 ? [{ type: 'text', text: body.join('\n') }] : [],
  };
}

/**
 * Matches both Memoire's own export syntax (`[ ] text`, no leading bullet —
 * see `taskItem.toMarkdown`, which `taskList.toMarkdown` joins with no `- `
 * prefix) and the common external convention (`- [ ] text`, GitHub/Obsidian/
 * most other Markdown tools) — a Markdown *import* has to accept files that
 * were never produced by this app.
 */
const TASK_ITEM_PATTERN = /^\s*(?:[-*]\s+)?\[([ xX])\]\s+(.*)$/;

function parseTaskList(lines: string[]): TiptapNode {
  const items = lines.map((l) => {
    const m = TASK_ITEM_PATTERN.exec(l)!;
    return {
      type: 'taskItem',
      attrs: { checked: m[1].toLowerCase() === 'x' },
      content: [paragraphNode(m[2])],
    };
  });
  return { type: 'taskList', content: items };
}

function parseBulletList(lines: string[]): TiptapNode {
  const items = lines.map((l) => {
    const text = l.replace(/^\s*[-*]\s+/, '');
    return { type: 'listItem', content: [paragraphNode(text)] };
  });
  return { type: 'bulletList', content: items };
}

function parseOrderedList(lines: string[]): TiptapNode {
  const items = lines.map((l) => {
    const text = l.replace(/^\s*\d+\.\s+/, '');
    return { type: 'listItem', content: [paragraphNode(text)] };
  });
  return { type: 'orderedList', content: items };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function parseTable(lines: string[]): TiptapNode {
  const [headerLine, , ...bodyLines] = lines;
  const headerCells = splitTableRow(headerLine);
  const cellNode = (type: 'tableHeader' | 'tableCell', text: string): TiptapNode => ({
    type,
    content: [paragraphNode(text)],
  });
  const headerRow: TiptapNode = {
    type: 'tableRow',
    content: headerCells.map((c) => cellNode('tableHeader', c)),
  };
  const bodyRows: TiptapNode[] = bodyLines.map((line) => ({
    type: 'tableRow',
    content: splitTableRow(line).map((c) => cellNode('tableCell', c)),
  }));
  return { type: 'table', content: [headerRow, ...bodyRows] };
}

/** Inline mark parsing — mirrors `inlineToMarkdown`'s syntax exactly, in reverse. Order matters: longer/more-specific delimiters before shorter ones that could prefix-match them. */
const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|~~[^~]+~~|==[^=]+==|`[^`]+`|\*[^*]+\*|\[[^\]]*\]\([^)]*\)|\$[^$]+\$)/;

function parseInline(text: string): TiptapNode[] {
  const parts = text.split(INLINE_PATTERN).filter((p) => p !== '');
  const nodes: TiptapNode[] = [];

  for (const part of parts) {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'bold' }] });
    } else if (/^~~[^~]+~~$/.test(part)) {
      nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'strike' }] });
    } else if (/^==[^=]+==$/.test(part)) {
      nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'highlight' }] });
    } else if (/^`[^`]+`$/.test(part)) {
      nodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'code' }] });
    } else if (/^\*[^*]+\*$/.test(part)) {
      nodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'italic' }] });
    } else if (/^\[[^\]]*\]\([^)]*\)$/.test(part)) {
      const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(part)!;
      nodes.push({ type: 'text', text: m[1], marks: [{ type: 'link', attrs: { href: m[2] } }] });
    } else if (/^\$[^$]+\$$/.test(part)) {
      nodes.push({ type: 'inlineEquation', attrs: { latex: part.slice(1, -1) } });
    } else if (part.length > 0) {
      nodes.push({ type: 'text', text: part });
    }
  }
  return nodes;
}

/** Best-effort page-title guess from the first heading/paragraph, for a Markdown file with no other title source (§30A.1). */
export function guessTitleFromMarkdown(markdown: string): string {
  const firstLine = markdown.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return firstLine.replace(/^#{1,6}\s+/, '').trim() || 'Untitled';
}
