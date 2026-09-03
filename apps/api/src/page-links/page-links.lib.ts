import type { TiptapNodeDto } from '@memoire/validation';

export type CollectedPageLink = { sourceBlockId: string; targetPageId: string };

/**
 * Finds every `sub_page`/`link_to_page` node reachable from a top-level
 * block (§12B.3) — the block itself, or nested inside columns/toggles — and
 * returns the page it points at. `blockId` is always the *top-level* block's
 * id: nested links still attribute the backlink to the row that owns them
 * (§15A.2), since nested nodes are never normalized into their own rows.
 */
export function collectPageLinks(
  blockId: string,
  blockType: string,
  content: TiptapNodeDto | undefined,
): CollectedPageLink[] {
  const links: CollectedPageLink[] = [];

  const pageIdOf = (n: TiptapNodeDto | undefined) => {
    const targetPageId = n?.attrs?.pageId;
    return typeof targetPageId === 'string' ? targetPageId : undefined;
  };

  if (blockType === 'sub_page' || blockType === 'link_to_page') {
    const targetPageId = pageIdOf(content);
    if (targetPageId) links.push({ sourceBlockId: blockId, targetPageId });
  }

  const walk = (n: TiptapNodeDto | undefined) => {
    for (const child of n?.content ?? []) {
      if (child.type === 'sub_page' || child.type === 'link_to_page') {
        const targetPageId = pageIdOf(child);
        if (targetPageId) links.push({ sourceBlockId: blockId, targetPageId });
      }
      walk(child);
    }
  };
  walk(content);

  return links;
}
