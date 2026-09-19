(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.mode !== 'member') return;
  root.dataset.uiuxCompliance = '2026-09';

  function enhanceKycPrivacy() {
    const modal = document.querySelector('[data-modal="kyc"] .modal');
    if (!modal || modal.querySelector('.uiux-kyc-privacy-note')) return;

    const note = document.createElement('div');
    note.className = 'uiux-kyc-privacy-note';
    note.setAttribute('role', 'note');
    note.innerHTML = '<strong>신분증 제출 전 확인해 주세요.</strong><br>주민등록번호 뒷자리 등 본인확인에 필요하지 않은 정보는 가린 뒤 제출해 주세요. 법적 근거와 별도 안내가 있는 경우에는 해당 안내를 따라 주세요.';

    const slots = modal.querySelector('.kyc-slots');
    const notice = modal.querySelector('.notice');
    if (slots) slots.before(note);
    else if (notice) notice.after(note);
    else modal.querySelector('.modal-body')?.prepend(note);
  }

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceKycPrivacy();
    });
  });

  function start() {
    enhanceKycPrivacy();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();