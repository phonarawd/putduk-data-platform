(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'admin') return;
  if (window.__PUTDUK_ADMIN_MEMBER_CONTRACT__) return;
  window.__PUTDUK_ADMIN_MEMBER_CONTRACT__ = '20260920-p2member1';

  const core = window.PUTDUK_ADMIN_CORE;
  const admin = window.PUTDUK_ADMIN;
  if (!core?.adminRequest || !core?.getState || !core?.patchState || !admin) return;

  const PAGE_SIZE = 100;
  const MAX_ROWS = 10000;
  let requestSerial = 0;
  let contractBusy = false;
  let loadedSignature = '';

  function querySignature() {
    const state = core.getState() || {};
    return `${String(state.adminMemberQuery || '').trim()}|${String(state.adminMemberFilter || 'all')}`;
  }

  function normalize(row) {
    if (!row || typeof row !== 'object') return {};
    const id = row.user_id || row.id || '';
    const summary = row.wallet_summary && typeof row.wallet_summary === 'object' ? row.wallet_summary : {};
    return {
      ...row,
      id,
      user_id: id,
      phone: row.phone_e164 || row.phone || '',
      phone_e164: row.phone_e164 || row.phone || '',
      wallet: {
        support: summary.support ?? row.support_grant_krw ?? null,
        work: summary.work ?? row.work_balance_krw ?? null,
        available: summary.available ?? row.available_krw ?? null,
        held: summary.work_held ?? row.work_held_krw ?? null
      }
    };
  }

  function friendly(error) {
    if (typeof core.friendlyAdminError === 'function') return core.friendlyAdminError(error);
    return String(error?.message || error || '회원 정보를 불러오지 못했어요.');
  }

  async function fetchAllMembers(query) {
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const result = await core.adminRequest('list_members', {
        query: query || '',
        limit: PAGE_SIZE,
        offset
      });
      const page = Array.isArray(result?.members) ? result.members : [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
    throw new Error('회원 검색 결과가 너무 많아요. 검색어를 더 구체적으로 입력해 주세요.');
  }

  async function loadAdminMembers({ silent = false } = {}) {
    if (contractBusy) return;
    contractBusy = true;
    const serial = ++requestSerial;
    const state = core.getState() || {};
    const query = String(state.adminMemberQuery || '').trim();
    const filter = String(state.adminMemberFilter || 'all');
    const signature = `${query}|${filter}`;

    core.patchState({ adminMembersLoading: true });
    if (!silent && typeof core.render === 'function') core.render();

    try {
      const all = (await fetchAllMembers(query)).map(normalize);
      if (serial !== requestSerial) return;
      const visible = filter === 'all' ? all : all.filter((item) => String(item.status || '') === filter);
      core.patchState({
        adminMembers: visible,
        adminMemberTotal: all.length,
        adminMembersError: null,
        adminMembersContract: true
      });
      loadedSignature = signature;
    } catch (error) {
      if (serial !== requestSerial) return;
      core.patchState({
        adminMembers: [],
        adminMemberTotal: 0,
        adminMembersError: friendly(error),
        adminMembersContract: true
      });
      loadedSignature = signature;
    } finally {
      if (serial === requestSerial) {
        contractBusy = false;
        core.patchState({ adminMembersLoading: false });
        if (typeof core.render === 'function') core.render();
      }
    }
  }

  function memberByButton(button) {
    const id = String(button?.dataset?.memberId || '').trim();
    if (!id) return null;
    return (core.getState()?.adminMembers || []).find((item) => String(item.id || item.user_id || '') === id) || null;
  }

  function relabelWithdrawn(root) {
    root.querySelectorAll('[data-action="member-detail"][data-member-id]').forEach((button) => {
      const member = memberByButton(button);
      if (member?.status !== 'withdrawn') return;
      const row = button.closest('tr, .admin-mobile-card');
      const pill = row?.querySelector('.pill');
      if (pill) pill.textContent = '탈퇴';
    });
  }

  function ensureWithdrawnFilter(root) {
    const filterRow = root.querySelector('#memberSearchForm + .filter-row');
    if (!filterRow || filterRow.querySelector('[data-member-filter="withdrawn"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button ${core.getState()?.adminMemberFilter === 'withdrawn' ? 'active' : ''}`;
    button.dataset.memberFilter = 'withdrawn';
    button.textContent = '탈퇴';
    filterRow.appendChild(button);
  }

  function enhanceMemberPage() {
    if (core.getState()?.adminPage !== 'members') return;
    const root = document.getElementById('app');
    if (!root) return;
    ensureWithdrawnFilter(root);
    relabelWithdrawn(root);
    root.querySelectorAll('.admin-mobile-card .small-button, .admin-card .filter-button, #memberSearchForm .small-button').forEach((button) => {
      button.style.minHeight = '44px';
    });

    if (!contractBusy && core.getState()?.adminMembersLoading !== true && loadedSignature !== querySignature()) {
      queueMicrotask(() => loadAdminMembers({ silent: true }));
    }
  }

  core.loadAdminMembers = loadAdminMembers;

  const nativeAfterRender = typeof admin.afterRender === 'function' ? admin.afterRender.bind(admin) : null;
  admin.afterRender = function putdukAdminMemberAfterRender(...args) {
    const result = nativeAfterRender ? nativeAfterRender(...args) : undefined;
    enhanceMemberPage();
    return result;
  };

  document.addEventListener('click', (event) => {
    if (core.getState()?.adminPage !== 'members') return;
    const target = event.target?.closest?.('[data-member-filter], [data-action="refresh-members"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.dataset.memberFilter) core.patchState({ adminMemberFilter: target.dataset.memberFilter });
    loadedSignature = '';
    void loadAdminMembers({ silent: false });
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'memberSearchForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const query = String(document.getElementById('memberSearchInput')?.value || '').trim();
    core.patchState({ adminMemberQuery: query });
    loadedSignature = '';
    void loadAdminMembers({ silent: false });
  }, true);

  enhanceMemberPage();
})();
