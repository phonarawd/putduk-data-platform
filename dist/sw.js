const CACHE_NAME = 'putduk-shell-v17';
const SHELL = [
  '/',
  '/admin/',
  '/assets/app.css?v=20260918-ui3',
  '/assets/app.js?v=20260918-ui3',
  '/assets/overlay-surface.css?v=20260918-flash2',
  '/assets/overlay-surface.js?v=20260918-ui3',
  '/assets/origin-split.js?v=20260918-ui3',
  '/assets/ui-icons.js?v=20260918-ui3',
  '/assets/motion-runtime.js?v=20260918-ux1',
  '/assets/channel-talk.js?v=20260918-ch1',
  '/assets/vendor/supabase.min.js?v=20260918-ui3',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(event.request, url));
});

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const isDocument = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  const cached = await cache.match(request, isDocument ? { ignoreSearch: true } : undefined);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached || cache.match('/') || cache.match('/admin/'));
  return cached || network;
}
