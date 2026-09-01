// Minimal app-shell service worker (Sprint 11 — PWA).
//
// Scope is deliberately narrow: cache same-origin navigation + static build
// assets at runtime so the shell still loads offline. Actual page/block data
// offline support lives in IndexedDB (lib/offline-db.ts, lib/api.ts) — this
// worker never touches /api/* requests, so it can't go stale on app data.

const CACHE_NAME = 'memoire-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    }),
  );
});
