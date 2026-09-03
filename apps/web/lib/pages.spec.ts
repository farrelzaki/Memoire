import { describe, expect, it } from 'vitest';
import { buildPageTree, getBreadcrumbTrail, getSubtreeIds } from './pages';
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
    settings: {},
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

describe('getBreadcrumbTrail', () => {
  const root = makePage({ id: 'root' });
  const child = makePage({ id: 'child', parentPageId: 'root' });
  const grandchild = makePage({ id: 'grandchild', parentPageId: 'child' });
  const all = [root, child, grandchild];

  it('returns the ancestors root-first, ending at the page itself', () => {
    expect(getBreadcrumbTrail(all, 'grandchild').map((p) => p.id)).toEqual([
      'root',
      'child',
      'grandchild',
    ]);
  });

  it('returns just the page for a root-level page', () => {
    expect(getBreadcrumbTrail(all, 'root').map((p) => p.id)).toEqual(['root']);
  });

  it('returns empty for an unknown page', () => {
    expect(getBreadcrumbTrail(all, 'missing')).toEqual([]);
  });

  it('stops at a parent that is not in the list', () => {
    const orphan = makePage({ id: 'orphan', parentPageId: 'archived-parent' });
    expect(getBreadcrumbTrail([orphan], 'orphan').map((p) => p.id)).toEqual(['orphan']);
  });

  it('does not hang on a cyclic parent chain', () => {
    const a = makePage({ id: 'a', parentPageId: 'b' });
    const b = makePage({ id: 'b', parentPageId: 'a' });
    expect(getBreadcrumbTrail([a, b], 'a').map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('getSubtreeIds', () => {
  it('includes the page itself and every descendant', () => {
    const root = makePage({ id: 'root' });
    const child = makePage({ id: 'child', parentPageId: 'root' });
    const grandchild = makePage({ id: 'grandchild', parentPageId: 'child' });
    const other = makePage({ id: 'other' });

    const ids = getSubtreeIds([root, child, grandchild, other], 'root');
    expect([...ids].sort()).toEqual(['child', 'grandchild', 'root']);
    expect(ids.has('other')).toBe(false);
  });

  it('returns just the page when it has no children', () => {
    const leaf = makePage({ id: 'leaf' });
    expect([...getSubtreeIds([leaf], 'leaf')]).toEqual(['leaf']);
  });
});
