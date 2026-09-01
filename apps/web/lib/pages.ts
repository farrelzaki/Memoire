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

/**
 * Root-first trail of pages from the workspace root down to `pageId`
 * (inclusive) — the topbar breadcrumb. Stops early if the chain hits a
 * missing parent, and is cycle-safe so a corrupt chain can't hang the UI.
 */
export function getBreadcrumbTrail(pages: Page[], pageId: string): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail: Page[] = [];
  const seen = new Set<string>();

  let cursor: string | null = pageId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const page: Page | undefined = byId.get(cursor);
    if (!page) break;
    trail.unshift(page);
    cursor = page.parentPageId;
  }

  return trail;
}

/**
 * Ids of `pageId` and everything nested beneath it. Used to keep a page's
 * whole subtree out of its own "Move to" targets — a page can never be moved
 * inside itself.
 */
export function getSubtreeIds(pages: Page[], pageId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentPageId) continue;
    const siblings = childrenOf.get(page.parentPageId) ?? [];
    siblings.push(page.id);
    childrenOf.set(page.parentPageId, siblings);
  }

  const ids = new Set<string>();
  const walk = (id: string) => {
    if (ids.has(id)) return; // cycle guard
    ids.add(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  walk(pageId);
  return ids;
}
