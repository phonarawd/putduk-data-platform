(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;

  const REVEAL_WINDOW_MS = 60_000;
  const revealRequestedAt = new Map();
  let scheduled = false;

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

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
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
      .find((button) => withdrawalIdOf(button) === id);
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
