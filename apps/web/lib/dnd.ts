'use client';

import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

/**
 * From dnd-kit's `active`/`over` ids after a drag, the sibling ids to send
 * as `beforeId`/`afterId` to a `.../reorder`-style endpoint (§19A.4). Shared
 * across every drag surface (database rows/columns/tabs, sidebar pages) —
 * promoted here in Sprint 22 from `features/database/database-views.tsx`
 * (Sprint 21, its first consumer) since the sidebar isn't a database
 * feature. `orderedIds` is the list's rendered order *before* the drag.
 */
export function neighborsAfterDrag(
  orderedIds: string[],
  activeId: string,
  overId: string,
): { beforeId: string | null; afterId: string | null } {
  const activeIndex = orderedIds.indexOf(activeId);
  const overIndex = orderedIds.indexOf(overId);
  if (activeIndex === -1 || overIndex === -1) return { beforeId: null, afterId: null };

  const withoutActive = orderedIds.filter((id) => id !== activeId);
  const overIndexWithoutActive = withoutActive.indexOf(overId);
  // Drop after `over` when dragging down the list, before it when dragging up.
  const insertAt = activeIndex < overIndex ? overIndexWithoutActive + 1 : overIndexWithoutActive;

  return {
    beforeId: insertAt > 0 ? withoutActive[insertAt - 1] : null,
    afterId: insertAt < withoutActive.length ? withoutActive[insertAt] : null,
  };
}

/** `PointerSensor` with a small activation distance so drag handles don't hijack ordinary clicks on cell inputs/buttons/selects. */
export function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
}
