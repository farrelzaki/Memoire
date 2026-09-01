/**
 * Thin IndexedDB wrapper used as the local cache + mutation outbox for
 * offline editing (Sprint 11, §"Tidak ada realtime collaboration" —
 * offline support stays client-local, no CRDT/sync-server involved).
 *
 * Kept dependency-free (raw IndexedDB) rather than pulling in a wrapper
 * library, since the surface we need is tiny: get/put/delete by key and
 * read-all from a store.
 */

const DB_NAME = 'memoire-offline';
const DB_VERSION = 1;

export const STORES = {
  /** GET response bodies, keyed by request path — the read-side local cache. */
  httpCache: 'httpCache',
  /** Queued mutations made while offline, replayed in order once back online. */
  outbox: 'outbox',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export interface OutboxEntry {
  id: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.httpCache)) {
          db.createObjectStore(STORES.httpCache);
        }
        if (!db.objectStoreNames.contains(STORES.outbox)) {
          db.createObjectStore(STORES.outbox, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const offlineDb = {
  isAvailable: () => typeof indexedDB !== 'undefined',

  getAll<T>(store: StoreName): Promise<T[]> {
    return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  },
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  },
  put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
    return run(store, 'readwrite', (s) =>
      key === undefined ? s.put(value) : s.put(value, key),
    );
  },
  delete(store: StoreName, key: IDBValidKey): Promise<void> {
    return run<void>(store, 'readwrite', (s) => s.delete(key) as unknown as IDBRequest<void>);
  },
};
