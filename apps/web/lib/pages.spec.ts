import { describe, expect, it } from 'vitest';
import { buildPageTree } from './pages';
import type { Page } from './types';

function makePage(partial: Partial<Page> & { id: string }): Page {
  return {
    workspaceId: 'ws',
    parentPageId: null,
    title: partial.id,
    icon: null,
    coverUrl: null,
    type: 'document',
    isFavorite: false,
    isArchived: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('buildPageTree', () => {
  it('returns empty for no pages', () => {
    expect(buildPageTree([])).toEqual([]);
  });

  it('builds a nested hierarchy', () => {
    const root = makePage({ id: 'root' });
    const child = makePage({ id: 'child', parentPageId: 'root' });
    const grandchild = makePage({ id: 'grandchild', parentPageId: 'child' });
    const tree = buildPageTree([root, child, grandchild]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].children[0].id).toBe('child');
    expect(tree[0].children[0].children[0].id).toBe('grandchild');
  });

  it('sorts siblings by position', () => {
    const a = makePage({ id: 'a', position: 2 });
    const b = makePage({ id: 'b', position: 1 });
    expect(buildPageTree([a, b]).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('hoists pages with a missing parent to the root', () => {
    const orphan = makePage({ id: 'orphan', parentPageId: 'missing' });
    const tree = buildPageTree([orphan]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan');
  });
});
