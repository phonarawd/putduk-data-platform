(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;
  const config = window.PUTDUK_CONFIG || {};
  const signUrl = config.adminWorkAssetUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/admin-work-asset` : '');
  let client = null;
  const cache = new Map();
  const pending = new WeakSet();

  function getClient() {
    if (client) return client;
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return client;
  }

  function normalizePublic(raw) {
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    if (raw.startsWith('brand-logos/')) return `/assets/${raw}`;
    if (raw.startsWith('assets/')) return `/${raw}`;
    return '';
  }

  function isPrivatePath(raw) {
    return /^(?:kyc|deposit-proof|deposit_proof)\/[0-9a-f-]{36}\//i.test(raw) || /^[0-9a-f-]{36}\//i.test(raw);
  }

  async function signed(raw) {
    if (cache.has(raw)) return cache.get(raw);
    const api = getClient();
    if (!api || !signUrl) throw new Error('signed asset api unavailable');
    const { data, error } = await api.functions.invoke('admin-work-asset', { body: { path: raw } });
    if (error || data?.ok !== true || !data?.asset?.url) throw new Error(data?.error || 'asset signing failed');
    cache.set(raw, data.asset.url);
    return data.asset.url;
  }

  function fallback(img, copy = '이미지를 불러오지 못했습니다') {
    if (!img || img.dataset.phase2Fallback === '1') return;
    img.dataset.phase2Fallback = '1';
    const box = document.createElement('div');
    box.className = 'phase2-admin-image-fallback';
    box.textContent = copy;
    img.replaceWith(box);
  }

  async function fix(img) {
    if (!(img instanceof HTMLImageElement) || pending.has(img)) return;
    const raw = String(img.getAttribute('src') || '').trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return;
    const publicUrl = normalizePublic(raw);
    if (publicUrl && publicUrl !== raw) {
      img.src = publicUrl;
      img.dataset.phase2Normalized = '1';
      return;
    }
    if (!isPrivatePath(raw)) return;
    pending.add(img);
    try {
      img.src = await signed(raw);
      img.dataset.phase2Signed = '1';
    } catch (_) {
      fallback(img, '회원 증빙 이미지를 불러오지 못했습니다');
    } finally {
      pending.delete(img);
    }
  }

  function scan(root = document) {
    root.querySelectorAll?.('img').forEach((img) => fix(img));
  }

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const raw = String(img.getAttribute('src') || '').trim();
    if (isPrivatePath(raw) && img.dataset.phase2Signed !== '1') {
      fix(img);
      return;
    }
    fallback(img);
  }, true);

  const style = document.createElement('style');
  style.textContent = '.phase2-admin-image-fallback{min-height:120px;display:grid;place-items:center;padding:16px;border:1px dashed rgba(120,140,132,.38);border-radius:14px;background:rgba(120,140,132,.08);color:#718078;font-size:12px;text-align:center}';
  document.head.appendChild(style);

  function boot() {
    scan();
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) { if (node.matches?.('img')) fix(node); scan(node); } }))).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
