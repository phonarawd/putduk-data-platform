(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_NOTIFICATION_READ_CONTRACT__) return;
  window.__PUTDUK_NOTIFICATION_READ_CONTRACT__ = '20260920-p1notice1';

  const config = window.PUTDUK_CONFIG || {};
  let client = null;
  let rows = [];
  let refreshTimer = null;
  let lastFocused = null;
  const originalOpenItem = window.__putdukOpenNoticeItem;
  const originalMarkAll = window.__putdukMarkAllNoticesRead;

  function api() {
    if (client) return client;
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  function ensureStyle() {
    if (document.getElementById('putdukNotificationReadContractStyle')) return;
    const style = document.createElement('style');
    style.id = 'putdukNotificationReadContractStyle';
    style.textContent = `
      [data-putduk-notice-overlay]{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;background:rgba(3,12,9,.58);backdrop-filter:blur(8px)}
      [data-putduk-notice-dialog]{width:min(560px,calc(100vw - 24px));max-height:min(760px,calc(100dvh - 32px));overflow:hidden;border:1px solid var(--line,#dfe7e3);border-radius:22px;background:var(--surface,#fff);color:var(--text,#17352b);box-shadow:0 26px 70px rgba(3,20,14,.25);display:flex;flex-direction:column}
      .putduk-notice-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 20px 14px;border-bottom:1px solid var(--line,#dfe7e3)}
      .putduk-notice-head h2{margin:0;font-size:20px;line-height:1.3}.putduk-notice-head p{margin:5px 0 0;color:var(--muted,#6c7e77);font-size:13px}
      .putduk-notice-close{min-width:44px;min-height:44px;border:0;border-radius:12px;background:transparent;color:inherit;font-size:24px;cursor:pointer}
      .putduk-notice-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-bottom:1px solid var(--line,#dfe7e3);font-size:13px}
      .putduk-notice-mark-all{min-height:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--emerald,#0d9f76);font:inherit;font-weight:700;cursor:pointer}
      .putduk-notice-mark-all[disabled]{opacity:.48;cursor:default}
      .putduk-notice-list{overflow:auto;overscroll-behavior:contain;padding:10px 12px 14px}
      .putduk-notice-row{width:100%;display:grid;grid-template-columns:10px 1fr;gap:11px;text-align:left;padding:14px 12px;border:1px solid transparent;border-radius:14px;background:transparent;color:inherit;cursor:pointer}
      .putduk-notice-row:hover,.putduk-notice-row:focus-visible{background:color-mix(in srgb,var(--emerald,#0d9f76) 6%,var(--surface,#fff));outline:none;border-color:color-mix(in srgb,var(--emerald,#0d9f76) 22%,transparent)}
      .putduk-notice-row.is-unread{background:color-mix(in srgb,var(--emerald,#0d9f76) 7%,var(--surface,#fff))}
      .putduk-notice-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;background:transparent}.putduk-notice-row.is-unread .putduk-notice-dot{background:var(--emerald,#0d9f76)}
      .putduk-notice-copy{min-width:0}.putduk-notice-copy strong{display:block;font-size:14px;line-height:1.45}.putduk-notice-copy p{margin:4px 0 0;color:var(--text,#17352b);font-size:13px;line-height:1.55;overflow-wrap:anywhere}.putduk-notice-copy small{display:block;margin-top:6px;color:var(--muted,#6c7e77);font-size:12px}
      .putduk-notice-empty{padding:32px 20px;text-align:center;color:var(--muted,#6c7e77)}
      @media(max-width:640px){[data-putduk-notice-overlay]{align-items:end;padding:0}[data-putduk-notice-dialog]{width:100%;max-height:88dvh;border-radius:22px 22px 0 0;border-bottom:0}.putduk-notice-head{padding:18px 16px 12px}.putduk-notice-toolbar{padding:10px 16px}.putduk-notice-list{padding:8px 8px max(16px,env(safe-area-inset-bottom))}.putduk-notice-row{min-height:58px}}
    `;
    document.head.appendChild(style);
  }

  function safeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadRows() {
    const service = api();
    if (!service) return [];
    const session = (await service.auth.getSession()).data?.session;
    if (!session?.user?.id) return [];
    const result = await service
      .from('notifications')
      .select('id,title,body,notification_type,created_at,read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (result.error || !Array.isArray(result.data)) throw result.error || new Error('알림을 불러오지 못했어요.');
    rows = result.data;
    return rows;
  }

  function closeOverlay() {
    const overlay = document.querySelector('[data-putduk-notice-overlay]');
    if (overlay) overlay.remove();
    if (lastFocused instanceof HTMLElement && lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
  }

  function renderOverlay() {
    ensureStyle();
    let overlay = document.querySelector('[data-putduk-notice-overlay]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.dataset.putdukNoticeOverlay = '1';
      document.body.appendChild(overlay);
    }

    const unread = rows.filter((row) => !row.read_at).length;
    const list = rows.length
      ? rows.map((row) => {
        const title = safeText(row.title) || '안내';
        const body = safeText(row.body);
        const read = Boolean(row.read_at);
        return `<button type="button" class="putduk-notice-row${read ? '' : ' is-unread'}" data-putduk-notice-id="${String(row.id || '').replace(/"/g, '&quot;')}"><span class="putduk-notice-dot" aria-hidden="true"></span><span class="putduk-notice-copy"><strong>${escapeHtml(title)}</strong>${body ? `<p>${escapeHtml(body)}</p>` : ''}<small>${escapeHtml(formatTime(row.created_at))} · ${read ? '읽음' : '안 읽음'}</small></span></button>`;
      }).join('')
      : '<div class="putduk-notice-empty"><strong>새 안내가 없어요.</strong><p>운영자가 보내면 종 숫자에 바로 표시됩니다.</p></div>';

    overlay.innerHTML = `<section data-putduk-notice-dialog role="dialog" aria-modal="true" aria-labelledby="putdukNoticeTitle"><div class="putduk-notice-head"><div><h2 id="putdukNoticeTitle">알림</h2><p>목록을 여는 것만으로는 읽음 처리하지 않습니다.</p></div><button type="button" class="putduk-notice-close" data-putduk-notice-close aria-label="알림 닫기">×</button></div><div class="putduk-notice-toolbar"><span>${unread ? `안 읽은 안내 ${unread}건` : '모두 확인했어요'}</span><button type="button" class="putduk-notice-mark-all" data-putduk-notice-mark-all${unread ? '' : ' disabled'}>모두 읽음</button></div><div class="putduk-notice-list">${list}</div></section>`;
    overlay.querySelector('[data-putduk-notice-close]')?.focus();
  }

  async function openInbox() {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      await loadRows();
      renderOverlay();
    } catch (_) {
      if (typeof window.__putdukShowToast === 'function') window.__putdukShowToast('알림을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.', 'error');
    }
  }

  async function markAll() {
    const unreadIds = rows.filter((row) => !row.read_at).map((row) => row.id).filter(Boolean);
    if (!unreadIds.length) return;
    const button = document.querySelector('[data-putduk-notice-mark-all]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    if (typeof originalMarkAll === 'function') {
      await originalMarkAll();
    } else {
      const service = api();
      if (!service) return;
      await service.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds).is('read_at', null);
    }
    await loadRows();
    renderOverlay();
  }

  async function openItem(id) {
    closeOverlay();
    if (typeof originalOpenItem === 'function') {
      await originalOpenItem(id);
      return;
    }
    const service = api();
    if (!service || !id) return;
    await service.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  }

  window.__putdukOpenNotices = openInbox;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.matches('[data-putduk-notice-overlay]')) {
      closeOverlay();
      return;
    }
    const close = target.closest('[data-putduk-notice-close]');
    if (close) { closeOverlay(); return; }
    const mark = target.closest('[data-putduk-notice-mark-all]');
    if (mark) { event.preventDefault(); void markAll(); return; }
    const row = target.closest('[data-putduk-notice-id]');
    if (row) { event.preventDefault(); void openItem(row.getAttribute('data-putduk-notice-id') || ''); }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('[data-putduk-notice-overlay]')) closeOverlay();
  });

  const badgeObserver = new MutationObserver((records) => {
    if (!document.querySelector('[data-putduk-notice-overlay]')) return;
    if (!records.some((record) => record.target instanceof Element && (record.target.matches('[data-notification]') || record.target.closest?.('[data-notification]')))) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void loadRows().then(renderOverlay).catch(() => {});
    }, 120);
  });
  badgeObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
})();
