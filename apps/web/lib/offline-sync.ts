import { offlineDb, STORES, type OutboxEntry } from './offline-db';
import { coalesceOutbox, sortOutboxByAge } from './offline-queue';
import { useOfflineStore } from '@/stores/offline';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function refreshPendingCount(): Promise<void> {
  const entries = await offlineDb.getAll<OutboxEntry>(STORES.outbox);
  useOfflineStore.getState().setPendingCount(entries.length);
}

/** Queue a mutation made while offline; called from `api.ts`'s request() on network failure. */
export async function queueMutation(
  method: OutboxEntry['method'],
  path: string,
  body?: unknown,
): Promise<void> {
  if (!offlineDb.isAvailable()) return;
  const entry: OutboxEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method,
    path,
    body,
    createdAt: Date.now(),
  };
  const existing = await offlineDb.getAll<OutboxEntry>(STORES.outbox);
  const coalesced = coalesceOutbox([...existing, entry]);

  for (const stale of existing) {
    if (!coalesced.some((e) => e.id === stale.id)) {
      await offlineDb.delete(STORES.outbox, stale.id);
    }
  }
  for (const item of coalesced) {
    await offlineDb.put(STORES.outbox, item, item.id);
  }
  await refreshPendingCount();
}

/**
 * Replay queued mutations against the API in the order they were made.
 * Stops and keeps remaining entries queued on the first failure (e.g. still
 * offline, or the API rejected the request) so nothing is silently dropped.
 */
export async function flushOutbox(): Promise<void> {
  if (!offlineDb.isAvailable() || typeof navigator !== 'undefined' && !navigator.onLine) return;

  const raw = await offlineDb.getAll<OutboxEntry>(STORES.outbox);
  const entries = sortOutboxByAge(coalesceOutbox(raw));

  for (const entry of entries) {
    try {
      const res = await fetch(`${API_BASE}${entry.path}`, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body !== undefined ? JSON.stringify(entry.body) : undefined,
      });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      await offlineDb.delete(STORES.outbox, entry.id);
    } catch {
      break;
    }
  }

  await refreshPendingCount();
}

let listenersBound = false;

/** Wire up online/offline tracking + auto-flush. Safe to call multiple times (idempotent). */
export function initOfflineSync(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  useOfflineStore.getState().setOnline(navigator.onLine);
  void refreshPendingCount();

  window.addEventListener('online', () => {
    useOfflineStore.getState().setOnline(true);
    void flushOutbox();
  });
  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOnline(false);
  });

  if (navigator.onLine) void flushOutbox();
}
