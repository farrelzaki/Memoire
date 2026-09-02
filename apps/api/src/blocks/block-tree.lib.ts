import type { TiptapNodeDto } from '@memoire/validation';

/**
 * Ids of every block nested inside a top-level node's `content` subtree
 * (columns, toggles, table cells, list items — never normalized into their
 * own rows, §11E.4). Used to populate `blocks.descendant_ids` so a nested
 * block can be found with one indexed query instead of scanning every row's
 * JSON.
 *
 * Only descendants are collected — the node's own blockId (== the row's id)
 * is deliberately excluded.
 */
export function collectDescendantBlockIds(node: TiptapNodeDto | undefined): string[] {
  const ids: string[] = [];

  const walk = (n: TiptapNodeDto | undefined) => {
    for (const child of n?.content ?? []) {
      const blockId = child.attrs?.blockId;
      if (typeof blockId === 'string') ids.push(blockId);
      walk(child);
    }
  };

  walk(node);
  return ids;
}
