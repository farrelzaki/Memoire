/**
 * Helpers for copying a database onto a new page (see
 * `DatabasesService.duplicateForPage`).
 *
 * Rows and view configs reference properties by id. A duplicate gets brand-new
 * property ids, so every stored reference has to be rewritten through the
 * old-id → new-id map or the copy silently loses its values, filters, and
 * grouping.
 */

/** Row `values` are keyed by property id — rekey them onto the copied properties. */
export function remapRowValues(
  values: Record<string, unknown> | null,
  propertyIdMap: Map<string, string>,
): Record<string, unknown> {
  if (!values) return {};
  const remapped: Record<string, unknown> = {};
  for (const [propertyId, value] of Object.entries(values)) {
    const nextId = propertyIdMap.get(propertyId);
    // Drop orphans: a key with no matching source property would be
    // unreachable in the copy anyway.
    if (nextId) remapped[nextId] = value;
  }
  return remapped;
}

/**
 * Rewrite the property ids a view config points at: `filters[].propertyId`,
 * `sorts[].propertyId`, plus the board `groupBy` and calendar `dateProperty`
 * keys. Unknown keys pass through untouched so new view options keep working
 * without changes here.
 */
export function remapViewConfig(
  config: Record<string, unknown> | null,
  propertyIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!config) return config;

  const remapId = (id: unknown): unknown =>
    typeof id === 'string' ? (propertyIdMap.get(id) ?? id) : id;

  const remapClauses = (clauses: unknown): unknown =>
    Array.isArray(clauses)
      ? clauses.map((clause) =>
          clause && typeof clause === 'object'
            ? { ...clause, propertyId: remapId((clause as { propertyId?: unknown }).propertyId) }
            : clause,
        )
      : clauses;

  const next: Record<string, unknown> = { ...config };
  if ('filters' in next) next.filters = remapClauses(next.filters);
  if ('sorts' in next) next.sorts = remapClauses(next.sorts);
  if ('groupBy' in next) next.groupBy = remapId(next.groupBy);
  if ('dateProperty' in next) next.dateProperty = remapId(next.dateProperty);
  return next;
}
