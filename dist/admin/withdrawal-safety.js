(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;

  const REVEAL_WINDOW_MS = 60_000;
  const revealRequestedAt = new Map();
  let scheduled = false;
  let balanceBusy = false;

  function core() {
    return window.PUTDUK_ADMIN_CORE || null;
  }

  function withdrawalIdOf(target) {
    return String(target?.dataset?.withdrawalId || '').trim();
  }

  function stateRevealMatches(id) {
    const state = core()?.getState?.();
    const reveal = state?.adminWithdrawalReveal;
    return Boolean(id && reveal && String(reveal.withdrawal_id || '') === id);
  }

  function recentlyRevealed(id) {
    const requestedAt = Number(revealRequestedAt.get(id) || 0);
    return stateRevealMatches(id) && requestedAt > 0 && Date.now() - requestedAt <= REVEAL_WINDOW_MS;
  }

  function makeRevealButton(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button';
    button.dataset.action = 'reveal-withdrawal-destination';
    button.dataset.withdrawalId = id;
    button.textContent = '지급정보 보기';
    return button;
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll('.admin-mobile-card [data-action="withdraw-complete"][data-withdrawal-id]').forEach((complete) => {
      const id = withdrawalIdOf(complete);
      const row = complete.closest('.action-row');
      if (!id || !row || row.querySelector('[data-action="reveal-withdrawal-destination"]')) return;
      row.insertBefore(makeRevealButton(id), complete);
    });
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function balancePayload(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    return {
      phase: String(form.dataset.phase || 'entry').trim(),
      userId: String(values.user_id || '').trim(),
      direction: String(values.direction || '').trim().toLowerCase(),
      amount: Number(values.amount),
      currency: String(values.currency || 'KRW').trim().toUpperCase(),
      bucket: String(values.bucket || 'available').trim(),
      reason: String(values.reason || '').trim()
    };
  }

  function validateBalance(payload) {
    if (!payload.userId) return '회원 정보를 다시 열어 주세요.';
    if (!['credit', 'debit'].includes(payload.direction)) return '입금 또는 차감 방향을 확인해 주세요.';
    if (!Number.isFinite(payload.amount) || payload.amount <= 0 || payload.amount > 100000000) return '금액은 1원 이상 1억원 이하로 입력해 주세요.';
    if (!['KRW', 'USDT'].includes(payload.currency)) return '통화를 확인해 주세요.';
    if (!['support_grant', 'work_balance', 'available'].includes(payload.bucket)) return '반영할 잔액 칸을 다시 선택해 주세요.';
    if (!payload.reason) return '운영 기록에 남길 사유를 입력해 주세요.';
    if (payload.reason.length > 500) return '사유는 500자 이내로 입력해 주세요.';
    return '';
  }

  async function handleBalanceAdjustClick(event, button) {
    const form = button.closest('#balanceAdjustForm');
    if (!(form instanceof HTMLFormElement)) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

    const api = core();
    if (!api?.adminRequest || !api?.openModal) {
      api?.showToast?.('운영자 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'warning');
      return true;
    }

    const payload = balancePayload(form);
    const validationError = validateBalance(payload);
    if (validationError) {
      api.showToast?.(validationError, 'warning');
      return true;
    }

    if (payload.phase === 'entry') {
      const state = api.getState?.() || {};
      const current = state.modalPayload || state.adminMemberDetail || {};
      api.openModal('balance-adjust', {
        ...current,
        id: payload.userId,
        user_id: payload.userId,
        direction: payload.direction,
        amount: payload.amount,
        currency: payload.currency,
        bucket: payload.bucket,
        reason: payload.reason,
        confirmAmount: payload.amount
      });
      return true;
    }

    if (payload.phase !== 'confirm' || balanceBusy) return true;
    balanceBusy = true;
    const original = button.textContent || '';
    button.disabled = true;
    button.textContent = '처리 중…';

    try {
      await api.adminRequest('adjust_balance', {
        user_id: payload.userId,
        direction: payload.direction,
        amount: payload.amount,
        currency: payload.currency,
        reason: payload.reason,
        bucket: payload.bucket
      });

      let member = null;
      try {
        const result = await api.adminRequest('get_member', { user_id: payload.userId });
        member = result?.member || result || null;
      } catch (_) {}

      api.showToast?.(payload.direction === 'credit' ? '✅ 잔액 입금을 반영했어요.' : '✅ 잔액 차감을 반영했어요.', 'success');
      if (member) {
        api.patchState?.({ adminMemberDetail: member });
        api.openModal('member-detail', member);
      } else {
        api.patchState?.({ modal: null, modalPayload: null });
        api.render?.();
      }
    } catch (error) {
      const message = api.friendlyAdminError?.(error) || String(error?.message || '잔액을 반영하지 못했습니다.');
      api.showToast?.(message, 'error');
      button.disabled = false;
      button.textContent = original;
    } finally {
      balanceBusy = false;
    }
    return true;
  }

  document.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const balanceSubmit = element?.closest('#balanceAdjustForm button[type="submit"]');
    if (balanceSubmit) {
      void handleBalanceAdjustClick(event, balanceSubmit);
      return;
    }

    const target = element?.closest('[data-action]') || null;
    if (!target) return;
    const action = String(target.dataset.action || '');
    const id = withdrawalIdOf(target);

    if (action === 'reveal-withdrawal-destination' && id) {
      revealRequestedAt.set(id, Date.now());
      return;
    }

    if (action === 'close-withdrawal-reveal') {
      revealRequestedAt.clear();
      return;
    }

    if (action !== 'withdraw-complete' || !id || recentlyRevealed(id)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    core()?.showToast?.('🔐 지급정보를 먼저 확인한 뒤 60초 안에 완료해 주세요.', 'warning');

    const revealButton = [...document.querySelectorAll('[data-action="reveal-withdrawal-destination"][data-withdrawal-id]')]
      .find((candidate) => withdrawalIdOf(candidate) === id);
    if (revealButton) {
      window.setTimeout(() => revealButton.click(), 0);
    }
  }, true);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  } else {
    scheduleScan();
  }
})();
