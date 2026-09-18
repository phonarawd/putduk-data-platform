(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'admin') return;

  const PAGE_SIZE = 25;
  const FETCH_SIZE = 100;
  const MAX_BATCHES = 100;
  const activityCache = new Map();
  const memberPackCache = new Map();
  let membersRequestId = 0;
  let membersHydrateQueued = false;

  function core() {
    return window.PUTDUK_ADMIN_CORE || null;
  }

  function esc(value) {
    return core()?.esc ? core().esc(value) : String(value ?? '')
      .replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function displayTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR');
  }

  function money(value) {
    if (value == null || value === '') return '-';
    const amount = Number(value);
    return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString('ko-KR')}원` : '-';
  }

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

  function normalizeMemberRow(row) {
    if (!row || typeof row !== 'object') return {};
    const id = row.user_id || row.id;
    return {
      ...row,
      id,
      user_id: id,
      public_id: row.public_id || '',
      display_name: row.display_name || row.legal_name || '퍼뜩 회원',
      legal_name: row.legal_name || '',
      email: row.email || '',
      phone: row.phone_e164 || row.phone || '',
      phone_e164: row.phone_e164 || row.phone || '',
      member_tier: row.member_tier || '라인',
      status: row.status || 'pending',
      kyc_status: row.kyc_status || 'pending',
      created_at: row.created_at || null,
      last_login_at: row.last_login_at || row.last_sign_in_at || null,
      last_login_ip: row.last_login_ip != null ? String(row.last_login_ip) : '',
      referral_count: numberOrNull(row.referral_count) ?? 0,
      wallet: {
        support: numberOrNull(row.wallet_summary?.support ?? row.support_grant_krw),
        work: numberOrNull(row.wallet_summary?.work ?? row.work_balance_krw),
        task: numberOrNull(row.wallet_summary?.task ?? row.task_reward_krw),
        referral: numberOrNull(row.wallet_summary?.referral),
        available: numberOrNull(row.wallet_summary?.available ?? row.available_krw),
        held: numberOrNull(row.wallet_summary?.work_held ?? row.work_held_krw ?? row.available_held_krw)
      },
      wallets: Array.isArray(row.wallets) ? row.wallets : null,
      pii_masked: row.pii_masked === true
    };
  }

  async function fetchAllMembers(query) {
    const api = core();
    if (!api) return [];
    const rows = [];
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await api.adminRequest('list_members', {
        query: query || '',
        limit: FETCH_SIZE,
        offset: batch * FETCH_SIZE
      });
      const chunk = Array.isArray(result.members) ? result.members : [];
      rows.push(...chunk);
      if (chunk.length < FETCH_SIZE) break;
    }
    return rows.map(normalizeMemberRow);
  }

  async function loadMemberPage({ page, filter, query, render = true } = {}) {
    const api = core();
    if (!api) return;
    const state = api.getState();
    const requestId = ++membersRequestId;
    const nextFilter = filter || state.adminMemberFilter || 'all';
    const nextQuery = query == null ? (state.adminMemberQuery || '') : String(query).trim();
    const nextPage = Math.max(1, Number(page || state.phase31MemberPage || 1));

    api.patchState({
      adminMembersLoading: true,
      adminMembersError: null,
      adminMemberFilter: nextFilter,
      adminMemberQuery: nextQuery,
      phase31MemberPage: nextPage,
      phase31MemberWiring: true
    });
    if (render) api.render();

    try {
      const all = await fetchAllMembers(nextQuery);
      if (requestId !== membersRequestId) return;
      const filtered = nextFilter === 'all' ? all : all.filter((item) => String(item.status) === nextFilter);
      const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      const safePage = Math.min(nextPage, pageCount);
      const start = (safePage - 1) * PAGE_SIZE;
      api.patchState({
        adminMembers: filtered.slice(start, start + PAGE_SIZE),
        adminMemberTotal: filtered.length,
        adminMembersLoading: false,
        adminMembersError: null,
        adminMembersContract: true,
        phase31MemberPage: safePage,
        phase31MemberPageCount: pageCount,
        phase31MemberLoaded: true
      });
    } catch (error) {
      if (requestId !== membersRequestId) return;
      api.patchState({
        adminMembers: [],
        adminMemberTotal: 0,
        adminMembersLoading: false,
        adminMembersError: api.friendlyAdminError ? api.friendlyAdminError(error) : '회원 목록을 불러오지 못했습니다.',
        adminMembersContract: true,
        phase31MemberLoaded: true
      });
    }
    if (render) api.render();
  }

  function paginationHtml() {
    const api = core();
    if (!api) return '';
    const state = api.getState();
    if (state.adminPage !== 'members' || state.adminMembersLoading) return '';
    const page = Math.max(1, Number(state.phase31MemberPage || 1));
    const pageCount = Math.max(1, Number(state.phase31MemberPageCount || 1));
    const total = Math.max(0, Number(state.adminMemberTotal || 0));
    if (total <= PAGE_SIZE && pageCount <= 1) return `<div class="admin-hint" style="margin-top:12px">서버 조회 ${total}명 · 페이지당 ${PAGE_SIZE}명</div>`;
    return `<div class="action-row" style="justify-content:center;margin-top:14px">
      <button class="small-button" type="button" data-phase31-member-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>이전</button>
      <span class="admin-hint" style="margin:0 8px">${page} / ${pageCount} · 총 ${total}명</span>
      <button class="small-button" type="button" data-phase31-member-page="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>다음</button>
    </div>`;
  }

  function historyList(items, emptyText, row) {
    if (!Array.isArray(items) || !items.length) return `<div class="history-empty">${esc(emptyText)}</div>`;
    return `<div class="history-list">${items.map(row).join('')}</div>`;
  }

  function activitySections(memberId) {
    const state = core()?.getState?.() || {};
    const pack = memberPackCache.get(String(memberId)) || (String(state.adminMemberPack?.profile?.id || '') === String(memberId) ? state.adminMemberPack : {});
    const activity = activityCache.get(String(memberId)) || {};
    const kyc = Array.isArray(pack.kyc_documents) ? pack.kyc_documents : [];
    const referrals = Array.isArray(pack.referrals) ? pack.referrals : [];
    const assignments = Array.isArray(pack.assignments) ? pack.assignments : [];
    const notifications = Array.isArray(activity.notifications) ? activity.notifications : [];
    const audits = Array.isArray(activity.audits) ? activity.audits : [];

    const section = (title, body) => `<section class="admin-card" style="margin-top:14px"><div class="admin-card-head"><div><h3>${esc(title)}</h3></div></div>${body}</section>`;

    const kycHtml = historyList(kyc, '본인확인 문서가 없습니다.', (item) => `<div class="history-item"><div><strong>${esc(item.document_kind || '본인확인')}</strong><small>${esc(item.status || '-')} · ${esc(displayTime(item.created_at))}</small></div>${item.rejection_reason ? `<span>${esc(item.rejection_reason)}</span>` : ''}</div>`);
    const referralHtml = historyList(referrals, '추천 관계가 없습니다.', (item) => `<div class="history-item"><div><strong>${esc(item.status || '추천')}</strong><small>${esc(displayTime(item.created_at))}</small></div><span>${esc(String(item.id || '').slice(0, 8) || '-')}</span></div>`);
    const assignmentHtml = historyList(assignments, '수동 배정 내역이 없습니다.', (item) => `<div class="history-item"><div><strong>${esc(item.status || '배정')}</strong><small>${esc(displayTime(item.created_at))} · ${esc(item.reason || '사유 없음')}</small></div><span>${money(item.reward_amount)}</span></div>`);
    const notificationHtml = historyList(notifications, '회원 알림 내역이 없습니다.', (item) => `<div class="history-item"><div><strong>${esc(item.title || '알림')}</strong><small>${esc(displayTime(item.created_at))}${item.read_at ? ' · 읽음' : ' · 미확인'}</small></div><span>${esc(item.body || '')}</span></div>`);
    const auditHtml = historyList(audits, '운영자 감사 기록이 없습니다.', (item) => `<div class="history-item"><div><strong>${esc(item.action || '운영자 조치')}</strong><small>${esc(displayTime(item.created_at))}</small></div><span>${esc(item.reason || '-')}</span></div>`);

    return `<div id="phase31MemberCanonicalDetail" data-member-id="${esc(memberId)}">
      ${section('KYC 문서', kycHtml)}
      ${section('추천 관계', referralHtml)}
      ${section('수동 배정 내역', assignmentHtml)}
      ${section('알림 내역', notificationHtml)}
      ${section('감사 로그', auditHtml)}
    </div>`;
  }

  async function ensureMemberCanonicalDetail(memberId) {
    const api = core();
    if (!api || !memberId) return;
    const key = String(memberId);
    if (activityCache.has(key) && memberPackCache.has(key)) return;
    try {
      const [memberResult, activityResult] = await Promise.all([
        memberPackCache.has(key) ? Promise.resolve({ member: memberPackCache.get(key) }) : api.adminRequest('get_member', { user_id: memberId }),
        activityCache.has(key) ? Promise.resolve({ activity: activityCache.get(key) }) : api.adminRequest('member_activity', { user_id: memberId })
      ]);
      const pack = memberResult.member || memberResult;
      const activity = activityResult.activity || activityResult;
      memberPackCache.set(key, pack || {});
      activityCache.set(key, activity || {});
      const state = api.getState();
      if (String(state.adminMemberDetail?.id || state.adminMemberDetail?.user_id || state.modalPayload?.id || state.modalPayload?.user_id || '') === key) {
        api.patchState({ adminMemberPack: pack || {}, phase31MemberActivity: activity || {} });
        api.render();
      }
    } catch (error) {
      api.showToast?.(api.friendlyAdminError ? api.friendlyAdminError(error) : '회원 상세 이력을 불러오지 못했습니다.', 'warning');
    }
  }

  function installRenderHooks() {
    const admin = window.PUTDUK_ADMIN;
    if (!admin || admin.__phase31Wiring) return false;
    admin.__phase31Wiring = true;

    const originalRenderPage = admin.renderPage?.bind(admin);
    if (originalRenderPage) {
      admin.renderPage = (page) => {
        const html = originalRenderPage(page);
        if (page !== 'members' || typeof html !== 'string') return html;
        const state = core()?.getState?.() || {};
        if (!state.phase31MemberLoaded && !state.adminMembersLoading && !membersHydrateQueued) {
          membersHydrateQueued = true;
          queueMicrotask(() => {
            membersHydrateQueued = false;
            loadMemberPage({ page: 1, render: true });
          });
        }
        return `${html}${paginationHtml()}`;
      };
    }

    const originalRenderModal = admin.renderModal?.bind(admin);
    if (originalRenderModal) {
      admin.renderModal = (type) => {
        const html = originalRenderModal(type);
        if (type !== 'member-detail' || typeof html !== 'string') return html;
        const state = core()?.getState?.() || {};
        const member = state.modalPayload || state.adminMemberDetail || {};
        const memberId = String(member.id || member.user_id || '');
        if (!memberId) return html;
        queueMicrotask(() => ensureMemberCanonicalDetail(memberId));
        const marker = '<div class="action-row" style="margin-top:16px"><button class="small-button primary" data-action="member-credit"';
        const idx = html.indexOf(marker);
        if (idx < 0) return html;
        return `${html.slice(0, idx)}${activitySections(memberId)}${html.slice(idx)}`;
      };
    }
    return true;
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,[data-member-filter],[data-action]') : null;
    if (!target) return;

    if (target.dataset.phase31MemberPage) {
      event.preventDefault();
      event.stopImmediatePropagation();
      loadMemberPage({ page: Number(target.dataset.phase31MemberPage) || 1 });
      return;
    }

    if (target.dataset.memberFilter) {
      event.preventDefault();
      event.stopImmediatePropagation();
      loadMemberPage({ page: 1, filter: target.dataset.memberFilter });
      return;
    }

    if (target.dataset.action === 'refresh-members') {
      event.preventDefault();
      event.stopImmediatePropagation();
      loadMemberPage({ page: core()?.getState?.().phase31MemberPage || 1 });
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'memberSearchForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = event.target.querySelector('#memberSearchInput')?.value || '';
    loadMemberPage({ page: 1, query });
  }, true);

  if (!installRenderHooks()) {
    window.addEventListener('DOMContentLoaded', installRenderHooks, { once: true });
    window.setTimeout(installRenderHooks, 0);
  }
})();
