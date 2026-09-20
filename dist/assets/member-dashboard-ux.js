(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const root = document.getElementById('app');
  if (!root) return;

  function walletSlot(label) {
    return Array.from(document.querySelectorAll('.wallet-card .wallet-slot')).find((slot) => {
      const lead = String(slot.querySelector('.ui-lead')?.textContent || '').replace(/\s+/g, ' ').trim();
      return lead.includes(label);
    }) || null;
  }

  function setHint(slot, copy) {
    const small = slot?.querySelector('small');
    if (small && small.textContent !== copy) small.textContent = copy;
  }

  function configureWallet() {
    const card = document.querySelector('.wallet-card');
    if (!card) return;

    const support = walletSlot('지원금');
    const work = walletSlot('업무잔액');
    const withdrawable = walletSlot('출금가능');

    setHint(support, '업무 전용 · 출금 불가');

    const workHint = String(work?.querySelector('small')?.textContent || '').trim();
    if (workHint.startsWith('잠금 ')) setHint(work, `내 원금 · ${workHint}`);
    else if (!workHint.startsWith('내 원금 · 잠금 ')) setHint(work, '내 원금 · 업무 시작에 사용');

    setHint(withdrawable, '승인 수당 · 출금 신청 가능');

    const slots = card.querySelector('.wallet-slots');
    if (slots && !card.querySelector('[data-wallet-meaning]')) {
      const legend = document.createElement('p');
      legend.className = 'wallet-meaning';
      legend.dataset.walletMeaning = '1';
      legend.textContent = '지원금은 업무 전용 · 업무잔액은 내 원금 · 출금가능은 승인된 수당';
      slots.after(legend);
    }

    const detail = card.querySelector('.wallet-cta [data-nav="wallet"]');
    if (detail && detail.textContent.trim() !== '지갑 상세') detail.textContent = '지갑 상세';

    const deposit = card.querySelector('.wallet-cta [data-action="deposit-info"]');
    if (!deposit) return;

    const supportAvailable = Boolean(support && !support.classList.contains('is-zero'));
    deposit.hidden = supportAvailable;
    deposit.setAttribute('aria-hidden', supportAvailable ? 'true' : 'false');
    if (!supportAvailable && deposit.textContent.trim() !== '업무잔액 충전') deposit.textContent = '업무잔액 충전';
  }

  function makeFallbackNextAction() {
    const signedOut = Boolean(document.querySelector('.hero-actions [data-action="open-signup"]'));
    const notice = document.createElement('div');
    notice.className = 'notice dashboard-next-action';
    notice.dataset.dashboardNextAction = 'fallback';

    const copy = document.createElement('div');
    copy.className = 'dashboard-next-copy';
    const title = document.createElement('strong');
    title.textContent = signedOut ? '다음 할 일 · 로그인' : '다음 할 일 · 오늘 업무 선택';
    const detail = document.createElement('span');
    detail.textContent = signedOut
      ? '계정을 이어서 열면 지원금·업무잔액·출금가능 금액을 서버 기준으로 확인할 수 있어요.'
      : '진행 중인 업무가 없어요. 오늘 가능한 업무에서 한 칸을 골라 시작하세요.';
    copy.append(title, detail);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button primary';
    if (signedOut) {
      button.dataset.action = 'open-signup';
      button.textContent = '로그인·회원가입';
    } else {
      button.dataset.nav = 'nodes';
      button.textContent = '오늘 업무 보기';
    }

    notice.append(copy, button);
    return notice;
  }

  function configureNextAction() {
    const hero = document.querySelector('.grid-hero');
    if (!hero) return;

    const runButton = document.querySelector('[data-action="open-run"]');
    const reviewButton = document.querySelector('[data-action="open-review-wait"]');
    const stateNotice = (runButton || reviewButton)?.closest('.notice') || null;
    const fallback = document.querySelector('[data-dashboard-next-action="fallback"]');

    if (stateNotice) {
      fallback?.remove();
      stateNotice.classList.add('dashboard-next-action');
      stateNotice.dataset.dashboardNextAction = runButton ? 'in-progress' : 'review-wait';
      if (hero.previousElementSibling !== stateNotice) hero.before(stateNotice);
      return;
    }

    document.querySelectorAll('.dashboard-next-action[data-dashboard-next-action]:not([data-dashboard-next-action="fallback"])').forEach((node) => {
      node.classList.remove('dashboard-next-action');
      delete node.dataset.dashboardNextAction;
    });

    if (!fallback) hero.before(makeFallbackNextAction());
    else if (hero.previousElementSibling !== fallback) hero.before(fallback);
  }

  function applyDashboardPolicy() {
    if (!document.querySelector('.grid-hero')) return;
    configureNextAction();
    configureWallet();
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyDashboardPolicy();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
