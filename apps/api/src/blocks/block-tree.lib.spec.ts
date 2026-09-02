import { describe, expect, it } from 'vitest';
import { collectDescendantBlockIds } from './block-tree.lib';

describe('collectDescendantBlockIds', () => {
  it('returns empty for a node with no content', () => {
    expect(collectDescendantBlockIds({ type: 'paragraph', attrs: { blockId: 'a' } })).toEqual([]);
  });

  it('collects ids from direct children', () => {
    const node = {
      type: 'bulletList',
      attrs: { blockId: 'top' },
      content: [
        { type: 'listItem', attrs: { blockId: 'x' } },
        { type: 'listItem', attrs: { blockId: 'y' } },
      ],
    };
    expect(collectDescendantBlockIds(node).sort()).toEqual(['x', 'y']);
  });

  it('recurses into deeply nested children', () => {
    const node = {
      type: 'columns',
      attrs: { blockId: 'top' },
      content: [
        {
          type: 'column',
          attrs: { blockId: 'col1' },
          content: [{ type: 'paragraph', attrs: { blockId: 'p1' } }],
        },
      ],
    };
    expect(collectDescendantBlockIds(node).sort()).toEqual(['col1', 'p1']);
  });

  it('skips children without a blockId attr, without crashing', () => {
    const node = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'hi' }],
    };
    expect(collectDescendantBlockIds(node)).toEqual([]);
  });

  it('handles undefined input', () => {
    expect(collectDescendantBlockIds(undefined)).toEqual([]);
  });
});
