(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.mode !== 'member') return;
  root.dataset.uiuxAuth = '2026-09';

  const eyeIcon = (visible) => visible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/><path d="m4 4 16 16"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>';

  function addFieldBadge(field) {
    const control = field.querySelector('input, select, textarea');
    const label = field.querySelector('label');
    if (!control || !label || label.querySelector('.uiux-field-badge')) return;
    const badge = document.createElement('span');
    badge.className = `uiux-field-badge ${control.required ? 'is-required' : 'is-optional'}`;
    badge.textContent = control.required ? '필수' : '선택';
    label.appendChild(badge);
  }

  function wrapPassword(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.uiuxPassword === '1') return;
    input.dataset.uiuxPassword = '1';
    const wrapper = document.createElement('div');
    wrapper.className = 'uiux-password-control';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'uiux-password-toggle';
    button.dataset.uiuxPasswordTarget = input.id;
    button.setAttribute('aria-label', '비밀번호 보기');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = eyeIcon(false);
    wrapper.appendChild(button);
  }

  function ensurePasswordHints(form) {
    const password = form.querySelector('#signupPassword');
    const confirm = form.querySelector('#signupPasswordConfirm');
    if (!password || !confirm) return;

    if (!password.closest('.field')?.querySelector('.uiux-password-hint')) {
      const hint = document.createElement('p');
      hint.className = 'uiux-password-hint';
      hint.dataset.passwordRule = 'length';
      hint.textContent = '8자 이상 입력해 주세요.';
      password.closest('.field')?.appendChild(hint);
    }
    if (!confirm.closest('.field')?.querySelector('.uiux-password-hint')) {
      const hint = document.createElement('p');
      hint.className = 'uiux-password-hint';
      hint.dataset.passwordRule = 'match';
      hint.textContent = '비밀번호를 한 번 더 입력해 주세요.';
      confirm.closest('.field')?.appendChild(hint);
    }
    updatePasswordHints(form);
  }

  function updatePasswordHints(form) {
    const password = form?.querySelector('#signupPassword');
    const confirm = form?.querySelector('#signupPasswordConfirm');
    if (!password || !confirm) return;

    const lengthHint = form.querySelector('[data-password-rule="length"]');
    const matchHint = form.querySelector('[data-password-rule="match"]');
    const longEnough = password.value.length >= 8;
    if (lengthHint) {
      lengthHint.dataset.state = password.value ? (longEnough ? 'ok' : 'error') : 'idle';
      lengthHint.textContent = password.value && longEnough ? '8자 이상 입력했어요.' : '8자 이상 입력해 주세요.';
    }

    const hasConfirm = confirm.value.length > 0;
    const matches = hasConfirm && password.value === confirm.value;
    confirm.setCustomValidity(hasConfirm && !matches ? '비밀번호가 일치하지 않습니다.' : '');
    if (matchHint) {
      matchHint.dataset.state = hasConfirm ? (matches ? 'ok' : 'error') : 'idle';
      matchHint.textContent = !hasConfirm ? '비밀번호를 한 번 더 입력해 주세요.' : matches ? '비밀번호가 일치해요.' : '비밀번호가 일치하지 않아요.';
    }
  }

  function agreementRow({ input, label, badge, legal }) {
    const row = document.createElement('div');
    row.className = 'uiux-agreement-row';
    row.appendChild(input);
    const text = document.createElement('label');
    text.setAttribute('for', input.id);
    text.innerHTML = `<span class="uiux-agreement-badge ${badge === '필수' ? 'is-required' : 'is-optional'}">${badge}</span><span>${label}</span>`;
    row.appendChild(text);
    if (legal) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'uiux-agreement-view';
      view.dataset.uiuxLegal = legal;
      view.textContent = '내용 보기';
      row.appendChild(view);
    }
    return row;
  }

  function enhanceAgreements(form) {
    if (form.querySelector('.uiux-agreements')) return;
    const terms = form.querySelector('#signupTerms');
    const marketing = form.querySelector('#signupMarketing');
    if (!terms || !marketing) return;

    const oldTermsRow = terms.closest('.check-row');
    const oldMarketingRow = marketing.closest('.check-row');

    const privacy = document.createElement('input');
    privacy.type = 'checkbox';
    privacy.id = 'signupPrivacy';
    privacy.required = true;

    const all = document.createElement('input');
    all.type = 'checkbox';
    all.id = 'signupAgreeAll';

    const block = document.createElement('section');
    block.className = 'uiux-agreements';
    block.setAttribute('aria-labelledby', 'signupAgreementTitle');
    block.innerHTML = '<div class="uiux-agreements-head"><div><strong id="signupAgreementTitle">약관 동의</strong><p>필수 항목을 확인해야 회원가입을 진행할 수 있어요.</p></div></div>';

    const allRow = document.createElement('div');
    allRow.className = 'uiux-agreement-all';
    allRow.appendChild(all);
    const allLabel = document.createElement('label');
    allLabel.setAttribute('for', all.id);
    allLabel.textContent = '전체 동의';
    allRow.appendChild(allLabel);
    block.appendChild(allRow);
    block.appendChild(agreementRow({ input: terms, label: '이용약관 동의', badge: '필수', legal: 'terms' }));
    block.appendChild(agreementRow({ input: privacy, label: '개인정보 수집·이용 동의', badge: '필수', legal: 'privacy' }));
    block.appendChild(agreementRow({ input: marketing, label: '업무 상태 및 서비스 안내 알림 수신', badge: '선택' }));

    const anchor = form.querySelector('.notice') || form.querySelector('.modal-actions');
    if (anchor) anchor.before(block);
    else form.appendChild(block);
    oldTermsRow?.remove();
    oldMarketingRow?.remove();

    const items = [terms, privacy, marketing];
    const syncAll = () => { all.checked = items.every((item) => item.checked); };
    all.addEventListener('change', () => {
      items.forEach((item) => { item.checked = all.checked; });
    });
    items.forEach((item) => item.addEventListener('change', syncAll));
    syncAll();
  }

  function enhanceAuthModal() {
    const modal = document.querySelector('[data-modal="auth"] .auth-modal');
    if (!modal || modal.dataset.uiuxAuthEnhanced === '1') return;
    modal.dataset.uiuxAuthEnhanced = '1';
    modal.classList.add('uiux-auth-modal');

    const loginForm = modal.querySelector('#loginForm');
    const signupForm = modal.querySelector('#signupForm');
    const heading = modal.querySelector('.modal-head h2');
    const subtitle = modal.querySelector('.modal-head p');

    if (loginForm) {
      modal.classList.add('is-login');
      if (heading) heading.textContent = '퍼뜩 로그인';
      if (subtitle) subtitle.textContent = '내 업무·정산 내역을 안전하게 이어서 확인하세요.';
      loginForm.querySelectorAll('.field').forEach(addFieldBadge);
      const password = loginForm.querySelector('#loginPassword');
      if (password) wrapPassword(password);
      const reset = loginForm.querySelector('[data-action="forgot-password"]');
      reset?.classList.add('uiux-auth-reset');
    }

    if (signupForm) {
      modal.classList.add('is-signup');
      if (heading) heading.textContent = '퍼뜩 회원가입';
      if (subtitle) subtitle.textContent = '필수 정보를 입력하고 약관을 확인한 뒤 계정을 만들어 주세요.';
      signupForm.querySelectorAll('.field').forEach(addFieldBadge);
      signupForm.querySelectorAll('input[type="password"]').forEach(wrapPassword);
      ensurePasswordHints(signupForm);
      enhanceAgreements(signupForm);

      const submit = signupForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = '회원가입';
      const cancel = signupForm.querySelector('[data-action="close-modal"]');
      if (cancel) cancel.textContent = '취소';
    }
  }

  document.addEventListener('click', (event) => {
    const passwordToggle = event.target.closest('[data-uiux-password-target]');
    if (passwordToggle) {
      const input = document.getElementById(passwordToggle.dataset.uiuxPasswordTarget || '');
      if (input instanceof HTMLInputElement) {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        passwordToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
        passwordToggle.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 보기');
        passwordToggle.innerHTML = eyeIcon(visible);
        input.focus({ preventScroll: true });
      }
      return;
    }
  });

  document.addEventListener('input', (event) => {
    if (!['signupPassword', 'signupPasswordConfirm'].includes(event.target?.id)) return;
    updatePasswordHints(event.target.closest('form'));
  });

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceAuthModal();
    });
  });


  function syncVisualViewportHeight() {
    const height = Math.round(window.visualViewport?.height || window.innerHeight || 0);
    if (height > 0) root.style.setProperty('--putduk-visual-viewport-height', `${height}px`);
  }

  function start() {
    syncVisualViewportHeight();
    window.addEventListener('resize', syncVisualViewportHeight, { passive: true });
    window.addEventListener('orientationchange', syncVisualViewportHeight, { passive: true });
    window.visualViewport?.addEventListener('resize', syncVisualViewportHeight, { passive: true });
    enhanceAuthModal();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();