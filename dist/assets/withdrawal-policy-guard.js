(() => {
  'use strict';

  const FORBIDDEN_WITHDRAWAL_COPY = [
    '등급과 라인이 내려가는 출금',
    '등급이 내려갔어요',
    '사원증 등급이'
  ];

  function isForbiddenWithdrawalToast(node) {
    const text = String(node?.textContent || '').replace(/\s+/g, ' ').trim();
    return FORBIDDEN_WITHDRAWAL_COPY.some((copy) => text.includes(copy));
  }

  function removeForbiddenWithdrawalToasts(root) {
    if (!root) return;
    const candidates = root.matches?.('.toast, [role="status"], [role="alert"]')
      ? [root]
      : Array.from(root.querySelectorAll?.('.toast, [role="status"], [role="alert"]') || []);
    for (const node of candidates) {
      if (isForbiddenWithdrawalToast(node)) node.remove();
    }
  }

  function installGuard() {
    const stack = document.getElementById('toastStack');
    if (!stack) return false;

    removeForbiddenWithdrawalToasts(stack);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) removeForbiddenWithdrawalToasts(node);
        }
      }
    });
    observer.observe(stack, { childList: true, subtree: true });
    return true;
  }

  if (!installGuard()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (installGuard() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();
