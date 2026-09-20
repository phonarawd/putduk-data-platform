(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const config = window.PUTDUK_CONFIG || {};
  const app = document.getElementById('app');
  const endpoint = config.memberExperienceUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/member-experience` : '');
  if (!app || !endpoint || !window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return;

  const runtime = window.PUTDUK_MEMBER_RUNTIME;
  const client = runtime?.getClient();
  if (!runtime || !client) return;

  const POLL_MS = 30_000;
  const REFRESH_DEBOUNCE_MS = 700;
  const HIGH_VALUE_MIN = 1_000_000;
  const state = {
    session: null,
    payload: null,
    loading: false,
    lastLoadedAt: 0,
    refreshTimer: null,
    applyFrame: null,
    previousWallet: null,
    previousUnlockedStake: null,
    unlockDismissedStake: 0,
    balanceGuide: null,
    destroyed: false
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  const won = (value) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ko-KR')}원`;
  const duration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    if (total < 60) return `${Math.max(total, 1)}초`;
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
  };

  function nodeMap() {
    return new Map((state.payload?.nodes || []).map((item) => [String(item.id), item]));
  }

  function eligibleNodes() {
    return (state.payload?.nodes || []).filter((item) => item.visible !== false);
  }

  function balanceFitComparator(a, b) {
    const balance = Number(state.payload?.work_balance || 0);
    const trialA = a.is_trial === true && state.payload?.trial_consumed !== true;
    const trialB = b.is_trial === true && state.payload?.trial_consumed !== true;
    if (trialA !== trialB) return trialA ? -1 : 1;
    if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;
    const affordA = a.is_trial ? Number(state.payload?.support_balance || 0) > 0 : Number(a.stake || 0) <= balance;
    const affordB = b.is_trial ? Number(state.payload?.support_balance || 0) > 0 : Number(b.stake || 0) <= balance;
    if (affordA !== affordB) return affordA ? -1 : 1;
    const stakeA = Number(a.stake || 0);
    const stakeB = Number(b.stake || 0);
    if (affordA && stakeA !== stakeB) return stakeB - stakeA;
    if (!affordA && stakeA !== stakeB) return stakeA - stakeB;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  }

  function sortedEligibleNodes() {
    return eligibleNodes().slice().sort(balanceFitComparator);
  }

  function proofHtml(item) {
    const budget = item.budget_verified
      ? `<span class="p4-proof-pill is-ok">✓ 지급예산 확인 완료 · ${won(item.budget_remaining)} 남음</span>`
      : `<span class="p4-proof-pill is-wait">지급예산 확인 중</span>`;
    const seats = Number.isFinite(Number(item.remaining_slots))
      ? `<span class="p4-proof-pill">오늘 남은 자리 ${Math.max(0, Number(item.remaining_slots)).toLocaleString('ko-KR')}개</span>`
      : `<span class="p4-proof-pill is-wait">남은 자리 확인 중</span>`;
    const completed = `<span class="p4-proof-pill">오늘 승인 ${Math.max(0, Number(item.completed_today || 0)).toLocaleString('ko-KR')}건</span>`;
    return `<div class="p4-proof-strip" data-p4-proof="${esc(item.id)}">${budget}${seats}${completed}</div>`;
  }

  function companyMark(name) {
    const label = String(name || '협력사').trim();
    return label ? [...label][0] : '협';
  }

  function buildCard(item) {
    const ready = item.can_start === true;
    const blocked = state.payload?.blocking_run === true;
    const cta = blocked ? '진행 중 업무 확인' : ready ? '업무 시작' : '필요한 업무잔액 보기';
    const action = ready && !blocked
      ? `data-start-node="${esc(item.id)}"`
      : `data-p4-balance-guide="${esc(item.id)}"`;
    const trialLabel = item.is_trial ? '지원금 잠금' : '업무 보증금';
    return `<article class="node-card compact-node p4-node-card" data-p4-node="${esc(item.id)}" data-level="${esc(item.difficulty || '일반 처리')}" style="--node-color:#0d9f76">
      <div class="node-accent"></div>
      <div class="node-top"><div class="company-mark">${esc(companyMark(item.company_name))}</div></div>
      <div class="node-company">${esc(item.company_name || '협력사')}</div>
      <div class="node-title">${esc(item.title || '업무')}</div>
      <div class="node-money"><div class="money-line"><span>${esc(trialLabel)} ${won(item.stake)}</span></div><div class="money-line"><span>완료 수당 ${won(item.stipend)}</span></div></div>
      ${proofHtml(item)}
      <div class="node-bottom"><div class="node-meta"><span>예상 ${esc(duration(item.estimated_seconds))}</span><span data-p4-slot="${esc(item.id)}">오늘 남은 자리 ${Math.max(0, Number(item.remaining_slots || 0)).toLocaleString('ko-KR')}개</span></div><button class="small-button ${ready ? 'primary' : ''}" type="button" ${action}>${esc(cta)}</button></div>
    </article>`;
  }

  function cardNodeId(card) {
    return String(card?.dataset?.p4Node || card?.querySelector?.('[data-start-node]')?.dataset?.startNode || card?.querySelector?.('[data-p4-balance-guide]')?.dataset?.p4BalanceGuide || '');
  }

  function patchExistingCard(card, item) {
    if (!card || !item) return;
    card.dataset.p4Node = String(item.id);
    const oldSlot = card.querySelector('[data-fomo-slot]');
    if (oldSlot) {
      oldSlot.removeAttribute('data-fomo-slot');
      oldSlot.setAttribute('data-p4-slot', String(item.id));
    }
    const slot = card.querySelector('[data-p4-slot]') || oldSlot;
    if (slot) slot.textContent = `오늘 남은 자리 ${Math.max(0, Number(item.remaining_slots || 0)).toLocaleString('ko-KR')}개`;
    const priorProof = card.querySelector('[data-p4-proof]');
    if (priorProof) priorProof.outerHTML = proofHtml(item);
    else card.querySelector('.node-bottom')?.insertAdjacentHTML('beforebegin', proofHtml(item));

    const button = card.querySelector('button[data-start-node], button[data-p4-balance-guide]');
    if (!button) return;
    if (state.payload?.blocking_run === true) {
      button.removeAttribute('data-start-node');
      button.dataset.p4BalanceGuide = String(item.id);
      button.textContent = '진행 중 업무 확인';
      return;
    }
    if (item.can_start === true) {
      delete button.dataset.p4BalanceGuide;
      button.dataset.startNode = String(item.id);
      button.textContent = '업무 시작';
      button.classList.add('primary');
    } else {
      button.removeAttribute('data-start-node');
      button.dataset.p4BalanceGuide = String(item.id);
      button.textContent = '필요한 업무잔액 보기';
      button.classList.remove('primary');
    }
  }

  function patchNodesGrid(grid) {
    if (!grid || !state.payload) return;
    const metrics = nodeMap();
    const current = new Map();
    grid.querySelectorAll('.node-card').forEach((card) => {
      const id = cardNodeId(card);
      if (!id) return;
      current.set(id, card);
      const item = metrics.get(id);
      if (item) patchExistingCard(card, item);
    });

    for (const item of sortedEligibleNodes()) {
      if (!current.has(String(item.id))) grid.insertAdjacentHTML('beforeend', buildCard(item));
    }

    const order = new Map(sortedEligibleNodes().map((item, index) => [String(item.id), index]));
    [...grid.querySelectorAll('.node-card')]
      .sort((a, b) => (order.get(cardNodeId(a)) ?? 99999) - (order.get(cardNodeId(b)) ?? 99999))
      .forEach((card) => grid.appendChild(card));
  }

  function dashboardRecommendationGrid() {
    return [...app.querySelectorAll('section.node-grid:not(#nodeGrid)')].find((grid) => {
      const heading = grid.previousElementSibling;
      return String(heading?.textContent || '').includes('오늘 추천 근무');
    }) || null;
  }

  function patchDashboardRecommendations() {
    const grid = dashboardRecommendationGrid();
    if (!grid || !state.payload) return;
    const top = sortedEligibleNodes().slice(0, 3);
    const signature = top.map((item) => item.id).join(',');
    if (grid.dataset.p4Signature !== signature) {
      grid.dataset.p4Signature = signature;
      grid.innerHTML = top.map(buildCard).join('') || grid.innerHTML;
    }
  }

  function patchGeneralOnboarding() {
    const modal = app.querySelector('[data-modal="onboard-general-work"]');
    if (!modal || modal.dataset.p4Patched === '1') return;
    modal.dataset.p4Patched = '1';
    const copy = modal.querySelector('.page-copy');
    if (copy) copy.textContent = '첫 업무의 수당이 실제 출금 가능 금액에 반영됐어요. 이제 현재 업무잔액으로 바로 할 수 있는 일반 업무부터 큰 금액 순서로 보여드릴게요. 업무잔액이 더 필요한 업무는 그 업무를 선택했을 때만 설명합니다.';
    const title = modal.querySelector('.modal-title-row');
    if (title) title.classList.add('p4-value-moment');
  }

  function parseWon(text) {
    const raw = String(text || '').replace(/[^0-9-]/g, '');
    return raw ? Number(raw) : null;
  }

  function walletSnapshotFromDom() {
    const slots = [...app.querySelectorAll('.wallet-slot')];
    const find = (label) => {
      const slot = slots.find((node) => String(node.textContent || '').includes(label));
      return slot ? parseWon(slot.querySelector('strong')?.textContent) : null;
    };
    return { work: find('업무잔액'), available: find('출금가능') };
  }

  function animateWalletDelta() {
    const current = walletSnapshotFromDom();
    if (current.work == null && current.available == null) return;
    if (!state.previousWallet) {
      state.previousWallet = current;
      return;
    }
    for (const key of ['work', 'available']) {
      const before = Number(state.previousWallet[key]);
      const after = Number(current[key]);
      if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) continue;
      const label = key === 'work' ? '업무잔액' : '출금가능';
      const slot = [...app.querySelectorAll('.wallet-slot')].find((node) => String(node.textContent || '').includes(label));
      if (!slot) continue;
      slot.classList.remove('p4-balance-rise');
      void slot.offsetWidth;
      slot.classList.add('p4-balance-rise');
      slot.querySelector('.p4-delta-chip')?.remove();
      slot.insertAdjacentHTML('beforeend', `<span class="p4-delta-chip">+${won(after - before)}</span>`);
      window.setTimeout(() => slot.querySelector('.p4-delta-chip')?.remove(), 2400);
    }
    state.previousWallet = current;
  }

  function maxUnlockedStake() {
    const balance = Number(state.payload?.work_balance || 0);
    return Math.max(0, ...eligibleNodes().filter((item) => !item.is_trial && !item.requires_assign && Number(item.stake || 0) <= balance && Number(item.remaining_slots || 0) > 0).map((item) => Number(item.stake || 0)));
  }

  function maybeShowUnlock() {
    if (!state.payload) return;
    const next = maxUnlockedStake();
    if (state.previousUnlockedStake == null) {
      state.previousUnlockedStake = next;
      return;
    }
    if (next <= state.previousUnlockedStake || next < HIGH_VALUE_MIN || next <= state.unlockDismissedStake) {
      state.previousUnlockedStake = Math.max(state.previousUnlockedStake, next);
      return;
    }
    state.previousUnlockedStake = next;
    const existing = document.getElementById('p4UnlockBanner');
    if (existing) existing.remove();
    const banner = document.createElement('aside');
    banner.id = 'p4UnlockBanner';
    banner.className = 'p4-unlock-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<div><span class="p4-unlock-kicker">새 업무 가능</span><strong>${won(next)}급 업무가 열렸어요</strong><p>현재 업무잔액으로 바로 시작할 수 있는 가장 큰 업무입니다.</p></div><div class="p4-unlock-actions"><button type="button" class="secondary-button" data-p4-dismiss-unlock="${next}">닫기</button><button type="button" class="primary-button" data-p4-open-nodes>업무 보기</button></div>`;
    document.body.appendChild(banner);
  }

  function openBalanceGuide(item) {
    if (!item) return;
    state.balanceGuide = item;
    document.getElementById('p4BalanceGuide')?.remove();
    const current = Number(state.payload?.work_balance || 0);
    const need = Math.max(0, Number(item.stake || 0) - current);
    const modal = document.createElement('div');
    modal.id = 'p4BalanceGuide';
    modal.className = 'modal-backdrop p4-balance-guide';
    modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h2>${esc(item.title || '이 업무')}에 필요한 업무잔액</h2><p>이 설명은 필요한 업무를 선택했을 때만 보여드려요.</p></div><button type="button" class="icon-button" data-p4-close-guide aria-label="닫기">×</button></div><div class="modal-body"><div class="p4-balance-figures"><div><span>현재 업무잔액</span><strong>${won(current)}</strong></div><div><span>업무 보증금</span><strong>${won(item.stake)}</strong></div><div><span>더 필요한 금액</span><strong>${won(need)}</strong></div><div><span>완료 수당</span><strong>+${won(item.stipend)}</strong></div></div><div class="notice"><div>업무 보증금은 진행 중에만 잠기며 정상 승인되면 업무잔액으로 전액 돌아옵니다. 완료 수당은 출금가능 금액에 따로 쌓입니다.</div></div><div class="modal-actions"><button type="button" class="secondary-button" data-p4-close-guide>다른 업무 보기</button><button type="button" class="primary-button" data-action="deposit-info" data-p4-close-guide>업무잔액 채우기</button></div></div></div>`;
    document.body.appendChild(modal);
  }

  function patchResultScene() {
    const modal = app.querySelector('[data-modal="result-scene"]');
    if (!modal || modal.querySelector('[data-p4-settlement-flow]')) return;
    const body = modal.querySelector('.modal-body') || modal.querySelector('.result-stage')?.parentElement;
    if (!body) return;
    body.insertAdjacentHTML('beforeend', `<div class="p4-settlement-flow" data-p4-settlement-flow><span>업무 보증금 → 업무잔액 복귀</span><span>완료 수당 → 출금가능 이동</span></div>`);
  }

  function patchAll() {
    if (state.destroyed) return;
    patchGeneralOnboarding();
    patchNodesGrid(document.getElementById('nodeGrid'));
    patchDashboardRecommendations();
    patchResultScene();
    animateWalletDelta();
    maybeShowUnlock();
  }

  function scheduleApply() {
    if (state.applyFrame) cancelAnimationFrame(state.applyFrame);
    state.applyFrame = requestAnimationFrame(() => {
      state.applyFrame = null;
      patchAll();
    });
  }

  async function requestExperience() {
    if (state.loading || state.destroyed) return;
    state.loading = true;
    try {
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData?.session || null;
      state.session = session;
      if (!session?.access_token) {
        state.payload = null;
        return;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: config.supabasePublishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'member_experience' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(String(body?.error || '회원 업무 현황을 불러오지 못했습니다.'));
      state.payload = body;
      state.lastLoadedAt = Date.now();
      scheduleApply();
    } catch (error) {
      console.warn('[member-experience] read failed', error);
    } finally {
      state.loading = false;
    }
  }

  function refreshSoon() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(requestExperience, REFRESH_DEBOUNCE_MS);
  }

  app.addEventListener('click', (event) => {
    const guide = event.target.closest('[data-p4-balance-guide]');
    if (guide) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const item = nodeMap().get(String(guide.dataset.p4BalanceGuide || ''));
      if (state.payload?.blocking_run === true) {
        const active = app.querySelector('[data-action="open-run"], [data-action="open-review-wait"]');
        active?.click();
        return;
      }
      openBalanceGuide(item);
      return;
    }
    if (event.target.closest('[data-start-node], [data-action="submit-work"], [data-action="submit-inspect"], [data-action="confirm-deposit"], form#depositForm, form#withdrawForm')) refreshSoon();
  }, true);

  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-p4-close-guide]');
    if (close) document.getElementById('p4BalanceGuide')?.remove();
    const dismiss = event.target.closest('[data-p4-dismiss-unlock]');
    if (dismiss) {
      state.unlockDismissedStake = Number(dismiss.dataset.p4DismissUnlock || 0);
      document.getElementById('p4UnlockBanner')?.remove();
    }
    const open = event.target.closest('[data-p4-open-nodes]');
    if (open) {
      document.getElementById('p4UnlockBanner')?.remove();
      const nav = app.querySelector('[data-nav="nodes"]');
      nav?.click();
    }
  }, true);

  const stopMutationObserver = runtime.observeMutations((records) => {
    if (records.some((record) => record.addedNodes.length || record.removedNodes.length)) scheduleApply();
  });

  const stopAuthObserver = runtime.onAuthStateChange((_event, session) => {
    state.session = session;
    state.payload = null;
    state.previousWallet = null;
    state.previousUnlockedStake = null;
    if (session) requestExperience();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.lastLoadedAt > 10_000) requestExperience();
  });

  requestExperience();
  const interval = setInterval(() => { if (!document.hidden) requestExperience(); }, POLL_MS);
  window.addEventListener('pagehide', () => {
    state.destroyed = true;
    clearInterval(interval);
    clearTimeout(state.refreshTimer);
    stopMutationObserver();
    stopAuthObserver();
  }, { once: true });
})();
