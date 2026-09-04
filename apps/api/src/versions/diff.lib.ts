import type { VersionBlockSnapshot } from '../db/schema';
import { canonicalJson } from './canonical-json.lib';

/**
 * §33A.5 block-level + word-level diff, hand-rolled (no dependency, matching
 * this codebase's dependency-averse pattern — ADR-12/13/25). `extractText`
 * deliberately does NOT use `BlockTypeRegistry.toPlainText`: that registry
 * is frontend-only (wraps live Tiptap extension objects, ADR-24/25) and
 * can't run in NestJS. Same generic-text-extraction technique already used
 * by `blocks.searchVector`'s `jsonb_path_query_array(content, '$.**.text')`
 * (SQL there, plain JS here).
 */

export type BlockChangeStatus = 'added' | 'removed' | 'moved' | 'changed';

export interface WordDiffToken {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface BlockDiffEntry {
  blockId: string;
  status: BlockChangeStatus;
  type: string | null;
  oldPosition: number | null;
  newPosition: number | null;
  wordDiff?: WordDiffToken[];
}

export function diffBlocks(oldBlocks: VersionBlockSnapshot[], newBlocks: VersionBlockSnapshot[]): BlockDiffEntry[] {
  const oldById = new Map(oldBlocks.map((b) => [b.id, b]));
  const newById = new Map(newBlocks.map((b) => [b.id, b]));
  const entries: BlockDiffEntry[] = [];

  for (const b of newBlocks) {
    if (!oldById.has(b.id)) {
      entries.push({ blockId: b.id, status: 'added', type: b.type, oldPosition: null, newPosition: b.position });
    }
  }
  for (const b of oldBlocks) {
    if (!newById.has(b.id)) {
      entries.push({ blockId: b.id, status: 'removed', type: b.type, oldPosition: b.position, newPosition: null });
    }
  }
  for (const b of newBlocks) {
    const old = oldById.get(b.id);
    if (!old) continue;
    if (canonicalJson(old.content) !== canonicalJson(b.content)) {
      entries.push({
        blockId: b.id,
        status: 'changed',
        type: b.type,
        oldPosition: old.position,
        newPosition: b.position,
        wordDiff: diffWords(extractText(old.content), extractText(b.content)),
      });
    } else if (old.position !== b.position) {
      entries.push({ blockId: b.id, status: 'moved', type: b.type, oldPosition: old.position, newPosition: b.position });
    }
    // else: unchanged — omitted, callers only care about deltas.
  }

  entries.sort((a, b) => (a.newPosition ?? a.oldPosition ?? 0) - (b.newPosition ?? b.oldPosition ?? 0));
  return entries;
}

/** Walks a Tiptap node tree collecting every `.text` leaf, root-level only —
 * diff granularity matches `blocks.parent_block_id` always being NULL (§11E). */
function extractText(content: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === 'string') parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(content);
  return parts.join(' ');
}

/** Classic DP LCS on whitespace-tokenized text — same class of algorithm as
 * line-based diff tools, adapted to word tokens. */
export function diffWords(oldText: string, newText: string): WordDiffToken[] {
  const a = oldText.split(/(\s+)/).filter((t) => t !== '');
  const b = newText.split(/(\s+)/).filter((t) => t !== '');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: WordDiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ op: 'equal', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ op: 'delete', text: a[i] });
      i++;
    } else {
      tokens.push({ op: 'insert', text: b[j] });
      j++;
    }
  }
  while (i < n) tokens.push({ op: 'delete', text: a[i++] });
  while (j < m) tokens.push({ op: 'insert', text: b[j++] });

  return mergeAdjacentTokens(tokens);
}

function mergeAdjacentTokens(tokens: WordDiffToken[]): WordDiffToken[] {
  const merged: WordDiffToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.op === token.op) last.text += token.text;
    else merged.push({ ...token });
  }
  return merged;
}
