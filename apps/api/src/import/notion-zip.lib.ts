import type { PropertyType } from '@memoire/validation';
import { guessColumnType, parseCsv } from './csv-parser.lib';
import type { TiptapNode } from './markdown-to-blocks.lib';

/**
 * Notion export .zip import (§30A.1, Sprint 24B) — hand-rolled, extending
 * Sprint 24's Markdown-zip precedent (`buildTreeFromZipEntries` in
 * `import.service.ts`) to also recognize `.csv` siblings and Notion's
 * hash-suffixed filenames. Scoped deliberately: best-effort internal-link
 * resolution via the hash, not an exhaustive Notion-format parser — see
 * the plan's scope note (unresolvable/unrecognized constructs already fall
 * back to a code block per §30A.3, same as plain Markdown import).
 */

const HASH_SUFFIX_PATTERN = /^(.*) ([0-9a-f]{32})$/i;

/** Strips Notion's 32-hex-char id suffix from a name (no file extension — strip that first). */
export function stripNotionHash(nameWithoutExtension: string): { title: string; hash: string | null } {
  const match = HASH_SUFFIX_PATTERN.exec(nameWithoutExtension);
  if (!match) return { title: nameWithoutExtension, hash: null };
  return { title: match[1], hash: match[2].toLowerCase() };
}

export interface NotionCsvDatabase {
  headers: string[];
  rows: string[][];
  columnTypes: PropertyType[];
}

export interface NotionParsedNode {
  title: string;
  hash: string | null;
  markdown: string | null;
  database: NotionCsvDatabase | null;
  children: NotionParsedNode[];
}

/**
 * Builds a page tree from zip entries, recognizing both `.md` and `.csv`
 * files (unlike the plain-Markdown importer's `buildTreeFromZipEntries`,
 * which only looks at `.md`). A `.csv` file whose hash-stripped title
 * matches a sibling folder's hash-stripped title attaches to that folder
 * node as `node.database` instead of becoming its own page (§30A.1 — "CSV
 * beside a folder = a database"). Also returns a `hash -> node` map for
 * `resolveNotionLinks`.
 */
export function buildNotionTree(entries: Record<string, Uint8Array>): {
  tree: NotionParsedNode[];
  hashToNode: Map<string, NotionParsedNode>;
} {
  const root: NotionParsedNode[] = [];
  const hashToNode = new Map<string, NotionParsedNode>();
  const decoder = new TextDecoder();

  const findOrCreate = (list: NotionParsedNode[], rawNameNoExt: string): NotionParsedNode => {
    const { title, hash } = stripNotionHash(rawNameNoExt);
    let node = list.find((n) => n.title === title);
    if (!node) {
      node = { title, hash, markdown: null, database: null, children: [] };
      list.push(node);
      if (hash) hashToNode.set(hash, node);
    }
    return node;
  };

  for (const [path, content] of Object.entries(entries)) {
    const lower = path.toLowerCase();
    const isMarkdown = lower.endsWith('.md');
    const isCsv = lower.endsWith('.csv');
    if (!isMarkdown && !isCsv) continue;

    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;

    let cursor = root;
    for (const folder of parts) {
      cursor = findOrCreate(cursor, folder).children;
    }

    const nameNoExt = fileName.replace(/\.(md|csv)$/i, '');
    const node = findOrCreate(cursor, nameNoExt);

    if (isCsv) {
      const rows = parseCsv(decoder.decode(content));
      if (rows.length > 0) {
        const [headers, ...dataRows] = rows;
        const columnTypes: PropertyType[] = headers.map((_, i) =>
          i === 0 ? 'title' : guessColumnType(dataRows.map((r) => r[i] ?? '')),
        );
        node.database = { headers, rows: dataRows, columnTypes };
      }
    } else {
      node.markdown = decoder.decode(content);
    }
  }

  return { tree: root, hashToNode };
}

const LINK_HASH_PATTERN = /([0-9a-f]{32})(\.md)?$/i;

/**
 * Rewrites `link` marks whose href points at a Notion hash-suffixed
 * filename (e.g. `Some%20Page%20a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.md`) to
 * `/<newPageId>` when that hash resolves in `hashToPageId`. Unresolvable
 * hash-looking links are left as-is and reported via `warnings` — a
 * downgrade to "still points at the old filename", not a fatal import
 * error, matching the same posture as the Markdown importer's unreachable
 * remote images.
 */
export function resolveNotionLinks(
  node: TiptapNode,
  hashToPageId: Map<string, string>,
  warnings: string[],
): TiptapNode {
  let result = node;
  if (node.marks) {
    const marks = node.marks.map((mark) => {
      if (mark.type !== 'link') return mark;
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : undefined;
      if (!href) return mark;
      let decoded = href;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        // malformed percent-encoding — fall through with the raw href
      }
      const match = LINK_HASH_PATTERN.exec(decoded);
      if (!match) return mark;
      const hash = match[1].toLowerCase();
      const pageId = hashToPageId.get(hash);
      if (pageId) return { ...mark, attrs: { ...mark.attrs, href: `/${pageId}` } };
      warnings.push(`Could not resolve internal link: ${href}`);
      return mark;
    });
    result = { ...node, marks };
  }
  if (node.content) {
    result = { ...result, content: node.content.map((child) => resolveNotionLinks(child, hashToPageId, warnings)) };
  }
  return result;
}
