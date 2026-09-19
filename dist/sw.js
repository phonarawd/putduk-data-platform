const CACHE_NAME = 'putduk-shell-v29';
const SHELL = [
  '/',
  '/admin/',
  '/assets/app.css?v=20260918-ui3',
  '/assets/app.js?v=20260919-sq1',
  '/assets/overlay-surface.css?v=20260918-flash2',
  '/assets/overlay-surface.js?v=20260918-ui3',
  '/assets/origin-split.js?v=20260918-ui3',
  '/assets/ui-icons.js?v=20260918-ui3',
  '/assets/motion-runtime.js?v=20260918-ux1',
  '/assets/channel-talk.js?v=20260918-ch1',
  '/assets/phase4-finance-wiring.js?v=20260919-p4r2',
  '/assets/brand-runtime.js?v=20260919-logo1',
  '/assets/uiux-final-2026.css?v=20260919-uiux1',
  '/assets/uiux-final-2026.js?v=20260919-uiux1',
  '/assets/uiux-premium-2026.css?v=20260919-uiux2',
  '/assets/uiux-premium-2026.js?v=20260919-uiux2',
  '/assets/uiux-growth-2026.css?v=20260919-uiux3',
  '/assets/uiux-growth-2026.js?v=20260919-uiux3',
  '/assets/uiux-auth-2026.css?v=20260919-uiux4',
  '/assets/uiux-auth-2026.js?v=20260919-uiux4',
  '/assets/uiux-legal-2026.css?v=20260919-uiux5',
  '/assets/uiux-legal-2026.js?v=20260919-uiux5',
  '/assets/uiux-compliance-2026.js?v=20260919-uiux5',
  '/admin/uiux-admin-premium-2026.css?v=20260919-uiux2',
  '/admin/uiux-admin-premium-2026.js?v=20260919-uiux2',
  '/assets/vendor/supabase.min.js?v=20260918-ui3',
  '/manifest.webmanifest',
  '/icons/putduk-premium.png',
  '/icons/icon-192.png'
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
  const isDocument = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  event.respondWith(isDocument ? networkFirstDocument(event.request) : staleWhileRevalidate(event.request));
});

async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('/')) || (await cache.match('/admin/'));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}
