// putduk-sw-off-v37 — 먹통 해제: 캐시하지 않고 네트워크만 통과한 뒤 등록을 푼다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim();
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
