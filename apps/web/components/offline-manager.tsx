'use client';

import { useEffect } from 'react';
import { initOfflineSync } from '@/lib/offline-sync';
import { useOfflineStore } from '@/stores/offline';

/** Registers the PWA service worker and starts offline tracking + outbox sync. */
export function OfflineManager() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);

  useEffect(() => {
    initOfflineSync();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline editing still works via IndexedDB without the shell worker.
      });
    }
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      {!isOnline ? (
        <span className="text-zinc-600 dark:text-zinc-300">
          You&apos;re offline — changes will sync when you reconnect
          {pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
        </span>
      ) : (
        <span className="text-zinc-600 dark:text-zinc-300">Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}…</span>
      )}
    </div>
  );
}
