import type { OutboxEntry } from './offline-db';

/** Only mutating requests need to be queued while offline; GETs just fall back to cache. */
export function isMutatingMethod(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

/**
 * Collapse repeated PATCH/PUT mutations to the same path into one entry
 * (shallow-merging bodies, last write wins per field) so reconnecting after
 * a long offline editing session replays one final state per resource
 * instead of every intermediate keystroke-triggered autosave.
 *
 * POST/DELETE are never merged — each represents a distinct operation that
 * must run in the order it was queued.
 */
export function coalesceOutbox(entries: OutboxEntry[]): OutboxEntry[] {
  const result: OutboxEntry[] = [];
  const mergeIndex = new Map<string, number>();

  for (const entry of entries) {
    if (entry.method === 'PATCH' || entry.method === 'PUT') {
      const key = `${entry.method} ${entry.path}`;
      const existingIdx = mergeIndex.get(key);
      if (existingIdx !== undefined) {
        const existing = result[existingIdx];
        result[existingIdx] = {
          ...entry,
          id: existing.id,
          createdAt: existing.createdAt,
          body:
            typeof existing.body === 'object' &&
            typeof entry.body === 'object' &&
            existing.body !== null &&
            entry.body !== null
              ? { ...existing.body, ...entry.body }
              : entry.body,
        };
        continue;
      }
      mergeIndex.set(key, result.length);
    }
    result.push(entry);
  }

  return result;
}

export function sortOutboxByAge(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}
