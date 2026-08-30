import type { Page } from './types';

export interface PageTreeNode extends Page {
  children: PageTreeNode[];
}

/**
 * Turn a flat page list into a nested tree, ordered by `position`.
 * Pages whose parent is not present (e.g. an archived parent) are hoisted to
 * the root so they never silently disappear from the sidebar.
 */
export function buildPageTree(pages: Page[]): PageTreeNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byParent = new Map<string | null, Page[]>();

  for (const page of pages) {
    const key =
      page.parentPageId && byId.has(page.parentPageId) ? page.parentPageId : null;
    const siblings = byParent.get(key) ?? [];
    siblings.push(page);
    byParent.set(key, siblings);
  }

  const build = (parentId: string | null): PageTreeNode[] => {
    const children = byParent.get(parentId) ?? [];
    return children
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((page) => ({ ...page, children: build(page.id) }));
  };

  return build(null);
}
