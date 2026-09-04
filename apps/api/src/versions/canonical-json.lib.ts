/**
 * Deterministic JSON serialization — recursively sorts object keys before
 * stringifying, so the same logical value always produces the same string
 * regardless of property insertion order. Used for §33A's content hash and
 * for change detection: the hash's only job is "did anything really
 * change," and the spec's own wording calls for a *canonical* form.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}
