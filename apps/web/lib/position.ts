/**
 * Fractional-position helpers for drag-and-drop reorder (§19A.4). Dropping an
 * item between two siblings assigns it the midpoint of their positions
 * instead of renumbering every sibling — cheap for the common case of one
 * move. Wiring `dnd-kit` itself to call these lands per-surface in later
 * sprints (sidebar: §22, database rows: §21); this is just the arithmetic.
 */

/** Smallest gap worth inserting into before a renormalization pass is needed. */
const MIN_GAP = 1e-7;

/**
 * Position for an item dropped between `before` and `after` (either edge may
 * be `null` for "at the start"/"at the end" of the list). Returns `null` when
 * the gap has collapsed below `MIN_GAP` — the caller must renormalize first.
 */
export function fractionalPosition(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  if (after - before < MIN_GAP) return null;
  return (before + after) / 2;
}

/** True when inserting between these two positions has run out of precision. */
export function needsRenormalization(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after - before < MIN_GAP;
}

/**
 * Reassigns every item in order to evenly spaced integer positions — the
 * "normalize back to whole numbers" step §19A.4 calls for once fractional
 * gaps get too small to bisect. Order of `ids` is preserved; only the
 * positions change.
 */
export function renormalizePositions<T extends { id: string }>(
  items: T[],
): Array<{ id: string; position: number }> {
  return items.map((item, index) => ({ id: item.id, position: index }));
}
