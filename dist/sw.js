// putduk-sw-push-v1 — Web Push 수신 + 네트워크 통과(캐시 없음)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: '퍼뜩', body: event.data ? String(event.data.text()) : '' };
  }
  const title = String(payload.title || '퍼뜩').trim() || '퍼뜩';
  const body = String(payload.body || '').trim();
  const tag = String(payload.tag || payload.data?.notification_id || 'putduk-notice');
  const data = payload.data && typeof payload.data === 'object' ? payload.data : { url: '/' };
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/putduk-premium.png',
    badge: '/icons/putduk-premium.png',
    tag,
    renotify: true,
    data
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = String(event.notification.data?.url || '/');
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && typeof client.navigate === 'function') {
          try { await client.navigate(targetUrl); } catch (_) {}
        }
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
