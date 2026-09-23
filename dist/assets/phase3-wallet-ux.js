(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_PHASE3_WALLET_UX__) return;
  window.__PUTDUK_PHASE3_WALLET_UX__ = true;

  const TAB_COPY = {
    all: {
      title: '아직 지갑 내역이 없어요.',
      body: '입금·출금 신청과 승인된 수당이 생기면 여기에 표시됩니다.'
    },
    in: {
      title: '아직 입금 내역이 없어요.',
      body: '입금 확인 요청을 접수하면 처리 상태가 이 탭에 표시됩니다.'
    },
    out: {
      title: '아직 출금 내역이 없어요.',
      body: '출금을 신청하면 처리 상태가 이 탭에 표시됩니다.'
    }
  };

  function isWalletPage(root) {
    const heading = root?.querySelector?.('h1.page-title');
    return String(heading?.textContent || '').trim() === '지갑';
  }

  function selectedLedgerTab(root) {
    const selected = root.querySelector('.ledger-tabs [data-ledger-tab].active')
      || root.querySelector('.ledger-tabs [data-ledger-tab][aria-selected="true"]');
    return String(selected?.getAttribute('data-ledger-tab') || 'all');
  }

  function syncLedgerTabA11y(root) {
    root.querySelectorAll('.ledger-tabs [data-ledger-tab]').forEach((button) => {
      const active = button.classList.contains('active');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const tabs = root.querySelector('.ledger-tabs');
    if (tabs) tabs.setAttribute('role', 'tablist');
  }

  function syncEmptyCopy(root) {
    const empty = root.querySelector('.record-empty');
    if (!empty) return;
    const copy = TAB_COPY[selectedLedgerTab(root)] || TAB_COPY.all;
    const title = empty.querySelector('strong');
    const body = empty.querySelector('p');
    if (title) title.textContent = copy.title;
    if (body) body.textContent = copy.body;
    empty.dataset.phase3WalletEmpty = selectedLedgerTab(root);
    empty.setAttribute('role', 'status');
    empty.setAttribute('aria-live', 'polite');
  }

  function guideMarkup() {
    return `
      <div class="phase3-withdraw-guide-head">
        <h3>출금 전에 확인하세요</h3>
        <p>신청 방식과 처리 기준만 짧게 정리했어요.</p>
      </div>
      <div class="phase3-withdraw-guide-list">
        <div class="phase3-withdraw-guide-row"><strong>수당만</strong><span>기본 출금입니다. 출금가능 잔액에서 신청해요.</span></div>
        <div class="phase3-withdraw-guide-row"><strong>원금 포함</strong><span>운영자가 확인 후 지급 처리하며, 완료된 원금만큼 업무잔액이 줄어요.</span></div>
        <div class="phase3-withdraw-guide-row"><strong>회원 상태</strong><span>원금 출금 자체로 회원 등급·혜택·라인은 바뀌지 않아요. 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요.</span></div>
      </div>`;
  }

  function enhanceWalletGuide(root) {
    const actions = root.querySelector('.withdraw-actions');
    if (!actions || root.querySelector('[data-phase3-withdraw-guide]')) return;
    const stale = actions.nextElementSibling;
    const guide = document.createElement('section');
    guide.className = 'phase3-withdraw-guide';
    guide.dataset.phase3WithdrawGuide = '1';
    guide.setAttribute('aria-label', '출금 안내');
    guide.innerHTML = guideMarkup();
    if (stale?.classList?.contains('notice')) stale.replaceWith(guide);
    else actions.insertAdjacentElement('afterend', guide);
  }

  function enhanceWithdrawForm(root) {
    const form = root.querySelector?.('#withdrawForm') || (root instanceof HTMLFormElement && root.id === 'withdrawForm' ? root : null);
    if (!(form instanceof HTMLFormElement) || form.dataset.phase3WithdrawGuide === '1') return;
    const kind = String(form.querySelector('input[name="withdraw_kind"]')?.value || 'allowance');
    const notice = form.querySelector('.notice');
    if (!notice) return;
    const originalText = String(notice.textContent || '').replace(/\s+/g, ' ').trim();
    const available = originalText.match(/출금가능\s+([^.]*)\.?$/)?.[1]?.trim() || '';
    notice.classList.add('phase3-withdraw-modal-guide');
    notice.dataset.phase3WithdrawModalGuide = '1';
    notice.innerHTML = kind === 'principal'
      ? '<strong>원금 포함 출금</strong><span>운영자가 확인 후 지급 처리합니다.</span><small>완료된 원금만큼 업무잔액이 줄어요. 회원 등급은 출금 자체로 변경되지 않아요.</small>'
      : `<strong>수당만 출금</strong><span>출금가능 잔액${available ? ` ${available}` : ''}에서 신청합니다.</span><small>업무잔액의 원금은 그대로 남아요.</small>`;
    form.dataset.phase3WithdrawGuide = '1';
  }

  function enhance(root = document) {
    const app = root.id === 'app' ? root : root.querySelector?.('#app') || document.getElementById('app');
    if (app && isWalletPage(app)) {
      syncLedgerTabA11y(app);
      syncEmptyCopy(app);
      enhanceWalletGuide(app);
    }
    enhanceWithdrawForm(root);
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-ledger-tab]');
    if (!tab) return;
    scheduleEnhance();
  }, true);

  let enhanceScheduled = false;
  function scheduleEnhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    window.requestAnimationFrame(() => {
      enhanceScheduled = false;
      const app = document.getElementById('app');
      if (app) enhance(app);
    });
  }

  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length || record.removedNodes.length)) return;
    scheduleEnhance();
  });

  function boot() {
    const app = document.getElementById('app');
    if (!app) return;
    enhance(app);
    observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
