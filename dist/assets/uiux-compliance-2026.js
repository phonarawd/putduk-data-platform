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

  function legalAccess(className) {
    const wrap = document.createElement('div');
    wrap.className = className;
    wrap.setAttribute('aria-label', '법적 고지');
    wrap.innerHTML = '<button type="button" class="text-link" data-uiux-legal="business">사업자정보</button><button type="button" class="text-link" data-uiux-legal="terms">이용약관</button><button type="button" class="text-link" data-uiux-legal="privacy">개인정보 처리 안내</button>';
    return wrap;
  }

  function enhanceSupportBusinessInfo() {
    const helpChannel = document.querySelector('.help-channel');
    if (!helpChannel || helpChannel.querySelector('.uiux-business-info-card')) return;

    const card = document.createElement('div');
    card.className = 'panel panel-pad uiux-business-info-card';
    card.innerHTML = '<h3>사업자정보</h3><p class="help-line"><span>퍼뜩을 운영하는 법인·대표자·문의처와 사업자정보 확인서를 확인할 수 있어요.</span></p><div class="uiux-business-info-actions"><button type="button" class="secondary-button" data-uiux-business-certificate>📄 사업자정보 확인서 보기</button><button type="button" class="text-link" data-uiux-legal="business">상세 정보</button></div>';
    helpChannel.insertAdjacentElement('afterend', card);
  }

  function enhanceLegalAccess() {
    const sideFooter = document.querySelector('.side-footer');
    if (sideFooter && !sideFooter.querySelector('.uiux-legal-access')) {
      sideFooter.appendChild(legalAccess('uiux-legal-access'));
    }

    const authModal = document.querySelector('[data-modal="auth"] .auth-modal');
    const authBody = authModal?.querySelector('.modal-body');
    if (authBody && !authBody.querySelector('.uiux-auth-legal-access')) {
      authBody.appendChild(legalAccess('uiux-auth-legal-access'));
    }
  }

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceKycPrivacy();
      enhanceLegalAccess();
      enhanceSupportBusinessInfo();
    });
  });

  function start() {
    enhanceKycPrivacy();
    enhanceLegalAccess();
    enhanceSupportBusinessInfo();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();