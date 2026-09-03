import { describe, expect, it } from 'vitest';
import { collectPageLinks } from './page-links.lib';

describe('collectPageLinks', () => {
  it('returns empty for a block with no links', () => {
    expect(collectPageLinks('b1', 'paragraph', { type: 'paragraph' })).toEqual([]);
  });

  it('collects a link from a top-level sub_page block', () => {
    const result = collectPageLinks('b1', 'sub_page', {
      type: 'sub_page',
      attrs: { blockId: 'b1', pageId: 'target-1' },
    });
    expect(result).toEqual([{ sourceBlockId: 'b1', targetPageId: 'target-1' }]);
  });

  it('collects a link from a top-level link_to_page block', () => {
    const result = collectPageLinks('b1', 'link_to_page', {
      type: 'link_to_page',
      attrs: { blockId: 'b1', pageId: 'target-2' },
    });
    expect(result).toEqual([{ sourceBlockId: 'b1', targetPageId: 'target-2' }]);
  });

  it('ignores a sub_page node with no pageId yet', () => {
    expect(collectPageLinks('b1', 'sub_page', { type: 'sub_page', attrs: {} })).toEqual([]);
  });

  it('finds links nested inside columns, attributing them to the top-level block', () => {
    const result = collectPageLinks('top', 'columns', {
      type: 'columns',
      attrs: { blockId: 'top' },
      content: [
        {
          type: 'column',
          attrs: { blockId: 'col1' },
          content: [{ type: 'link_to_page', attrs: { blockId: 'nested', pageId: 'target-3' } }],
        },
      ],
    });
    expect(result).toEqual([{ sourceBlockId: 'top', targetPageId: 'target-3' }]);
  });

  it('collects multiple links within one block', () => {
    const result = collectPageLinks('top', 'columns', {
      type: 'columns',
      attrs: { blockId: 'top' },
      content: [
        { type: 'link_to_page', attrs: { pageId: 'a' } },
        { type: 'link_to_page', attrs: { pageId: 'b' } },
      ],
    });
    expect(result.map((l) => l.targetPageId).sort()).toEqual(['a', 'b']);
  });
});
