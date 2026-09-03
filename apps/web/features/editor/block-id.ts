import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';

/**
 * Node types that carry a stable `blockId` — every type the backend can
 * upsert-by-id or address via `descendant_ids` (§11E.4): top-level rows and
 * anything nested inside them (list items, task items). Inline/leaf nodes
 * (text, hardBreak) are deliberately excluded.
 */
const BLOCK_ID_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'taskList',
  'taskItem',
  'image',
  'mermaid',
  'callout',
  'toggle',
  'table',
  'columns',
  'column',
  'equation',
  'subPage',
  'linkToPage',
  'breadcrumb',
  'tableOfContents',
  'syncedBlock',
  'fileBlock',
  'video',
  'audio',
  'pdf',
  'bookmark',
  'embed',
  'databaseView',
];

function newBlockId(): string {
  return crypto.randomUUID();
}

/**
 * Assigns a `blockId` to every node whose type carries the attribute and has
 * none yet, and reassigns a fresh id to any later duplicate — e.g. after
 * copy/paste duplicates a node along with its attrs — so `blockId` stays
 * unique per document. The server upserts by it (§11E.3), so a duplicate
 * would make two rows collapse into one on save.
 *
 * Exported standalone (not just as a plugin) so it's testable against a
 * plain ProseMirror doc without spinning up a full Tiptap `Editor`, which
 * needs a DOM this repo's Vitest env doesn't provide.
 */
export function assignBlockIds(tr: Transaction, doc: ProseMirrorNode): boolean {
  const seen = new Set<string>();
  let changed = false;

  doc.descendants((node, pos) => {
    if (!('blockId' in node.attrs)) return;
    const id = node.attrs.blockId;
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      return;
    }
    const freshId = newBlockId();
    seen.add(freshId);
    tr.setNodeAttribute(pos, 'blockId', freshId);
    changed = true;
  });

  return changed;
}

/**
 * Mints and maintains `blockId` — the stable identity the backend upserts
 * blocks by (§11E.3, invariant 1). Assignment happens in `appendTransaction`
 * rather than a node's own `addAttributes` default so it also catches
 * duplicates from copy/paste, not just brand-new nodes.
 */
export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_ID_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) =>
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockId'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const changed = assignBlockIds(tr, newState.doc);
          return changed ? tr : null;
        },
      }),
    ];
  },
});
