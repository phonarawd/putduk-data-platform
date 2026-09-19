const CACHE_MEMBER = 'putduk-member-v34';
const CACHE_ADMIN = 'putduk-admin-v34';

const MEMBER_SHELL = [
  '/',
  '/assets/app.css?v=20260920-perf2',
  '/assets/app.js?v=20260920-perf2',
  '/assets/overlay-surface.css?v=20260918-flash2',
  '/assets/overlay-surface.js?v=20260918-ui3',
  '/assets/origin-split.js?v=20260920-perf2',
  '/assets/perf-deferred.js?v=20260920-perf2',
  '/assets/uiux-final-2026.css?v=20260919-uiux1',
  '/assets/uiux-premium-2026.css?v=20260919-uiux2',
  '/assets/uiux-growth-2026.css?v=20260919-uiux3',
  '/assets/uiux-auth-2026.css?v=20260919-uiux4',
  '/assets/uiux-legal-2026.css?v=20260919-uiux8',
  '/assets/ui-icons.js?v=20260918-ui3',
  '/assets/vendor/supabase.min.js?v=20260918-ui3',
  '/manifest.webmanifest',
  '/icons/putduk-premium.png',
  '/icons/icon-192.png'
];

const ADMIN_SHELL = [
  '/admin/',
  '/admin/admin.css?v=20260918-ux1',
  '/admin/admin.js?v=20260919-p5r4',
  '/admin/phase3-admin-wiring.js?v=20260919-p32',
  '/assets/uiux-final-2026.css?v=20260919-uiux1',
  '/assets/uiux-final-2026.js?v=20260919-uiux1',
  '/assets/uiux-premium-2026.css?v=20260919-uiux2',
  '/assets/uiux-premium-2026.js?v=20260919-uiux2',
  '/assets/uiux-growth-2026.css?v=20260919-uiux3',
  '/assets/uiux-growth-2026.js?v=20260919-uiux3',
  '/assets/uiux-auth-2026.css?v=20260919-uiux4',
  '/assets/uiux-auth-2026.js?v=20260919-uiux4',
  '/assets/uiux-legal-2026.css?v=20260919-uiux8',
  '/assets/uiux-legal-2026.js?v=20260919-uiux8',
  '/assets/uiux-compliance-2026.js?v=20260919-uiux8',
  '/admin/uiux-admin-premium-2026.css?v=20260919-uiux2',
  '/admin/uiux-admin-premium-2026.js?v=20260919-uiux2',
  '/assets/motion-runtime.js?v=20260918-ux1',
  '/assets/channel-talk.js?v=20260918-ch1',
  '/assets/phase4-finance-wiring.js?v=20260919-p4r2',
  '/assets/brand-runtime.js?v=20260919-logo1'
];

let adminWarmPromise = null;

function isAdminRequest(url) {
  return url.pathname === '/admin' || url.pathname.startsWith('/admin/');
}

function cacheNameFor(url) {
  return isAdminRequest(url) ? CACHE_ADMIN : CACHE_MEMBER;
}

function warmAdminCache() {
  if (adminWarmPromise) return adminWarmPromise;
  adminWarmPromise = caches.open(CACHE_ADMIN).then((cache) => cache.addAll(ADMIN_SHELL)).catch(() => {});
  return adminWarmPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_MEMBER).then((cache) => cache.addAll(MEMBER_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_MEMBER && key !== CACHE_ADMIN).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isAdminRequest(url)) warmAdminCache();
  const isDocument = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  event.respondWith(isDocument ? networkFirstDocument(event.request, url) : staleWhileRevalidate(event.request, url));
});

async function networkFirstDocument(request, url) {
  const cache = await caches.open(cacheNameFor(url));
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (isAdminRequest(url) ? await caches.open(CACHE_ADMIN).then((c) => c.match('/admin/')) : null)
      || (await caches.open(CACHE_MEMBER).then((c) => c.match('/')));
  }
}

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(cacheNameFor(url));
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}
