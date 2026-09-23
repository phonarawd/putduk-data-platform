(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_FINANCE_FLOW_UX__) return;
  window.__PUTDUK_FINANCE_FLOW_UX__ = true;

  const HIGH_VALUE_MIN = 3000000;
  const nativeFetch = window.fetch.bind(window);

  function ensureStatus(form, initialText = '') {
    if (!(form instanceof HTMLFormElement)) return null;
    let box = form.querySelector('[data-putduk-finance-status]');
    if (!box) {
      box = document.createElement('div');
      box.className = 'putduk-finance-status';
      box.dataset.putdukFinanceStatus = '1';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      const actions = form.querySelector('.modal-actions');
      if (actions?.parentNode) actions.parentNode.insertBefore(box, actions);
      else form.appendChild(box);
    }
    if (initialText && !String(box.textContent || '').trim()) box.textContent = initialText;
    return box;
  }

  function setStatus(form, text, state = 'info') {
    const box = ensureStatus(form);
    if (!box) return;
    box.dataset.state = state;
    box.setAttribute('role', state === 'error' ? 'alert' : 'status');
    box.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    box.textContent = text;
  }

  function submitButton(form) {
    return form?.querySelector('button[type="submit"]') || null;
  }

  function setWithdrawBusy(form, busy) {
    if (!(form instanceof HTMLFormElement)) return;
    form.dataset.putdukWithdrawBusy = busy ? '1' : '0';
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    const button = submitButton(form);
    if (!(button instanceof HTMLButtonElement)) return;
    if (!button.dataset.putdukIdleLabel) button.dataset.putdukIdleLabel = button.textContent || '출금 신청';
    button.disabled = busy;
    button.textContent = busy ? '출금 요청 중…' : button.dataset.putdukIdleLabel;
  }

  function setFieldVisible(input, visible, required = false) {
    if (!(input instanceof HTMLInputElement)) return;
    const field = input.closest('.field');
    if (field instanceof HTMLElement) field.hidden = !visible;
    input.disabled = !visible;
    input.required = visible && required;
  }

  function resetHighConfirmation(form) {
    if (!(form instanceof HTMLFormElement)) return;
    delete form.dataset.putdukHighPending;
    delete form.dataset.putdukHighConfirmed;
    form.querySelector('[data-putduk-high-withdraw]')?.remove();
    const button = submitButton(form);
    if (button instanceof HTMLButtonElement && form.dataset.putdukWithdrawBusy !== '1') {
      button.textContent = button.dataset.putdukIdleLabel || '출금 신청';
    }
  }

  function syncWithdrawMethod(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const method = form.querySelector('#withdrawMethod');
    const bank = form.querySelector('#withdrawBank');
    const holder = form.querySelector('#withdrawHolder');
    const destination = form.querySelector('#withdrawDest');
    const network = form.querySelector('#withdrawNetwork');
    if (!(method instanceof HTMLSelectElement) || !(destination instanceof HTMLInputElement)) return;

    const isUsdt = method.value === 'usdt';
    setFieldVisible(bank, !isUsdt, true);
    setFieldVisible(holder, !isUsdt, true);
    setFieldVisible(network, isUsdt, true);

    const destinationField = destination.closest('.field');
    const destinationLabel = destinationField?.querySelector('label');
    if (destinationLabel) destinationLabel.textContent = isUsdt ? 'USDT 주소' : '계좌번호';
    destination.placeholder = isUsdt ? 'USDT 지갑 주소' : '계좌번호';

    ensureStatus(form, '출금은 자동 송금이 아니라 운영자가 확인한 뒤 수동으로 지급 처리합니다.');
    const button = submitButton(form);
    if (button instanceof HTMLButtonElement && !button.dataset.putdukIdleLabel) {
      button.dataset.putdukIdleLabel = '출금 신청';
      button.textContent = '출금 신청';
    }
  }

  function ensureHighConfirmation(form, amount) {
    let block = form.querySelector('[data-putduk-high-withdraw]');
    if (!block) {
      block = document.createElement('div');
      block.className = 'putduk-high-withdraw';
      block.dataset.putdukHighWithdraw = '1';
      block.innerHTML = `
        <strong>고액 출금 재확인</strong>
        <span>실수 방지를 위해 같은 금액을 한 번 더 입력해 주세요.</span>
        <input type="text" inputmode="numeric" autocomplete="off" data-putduk-high-repeat aria-label="고액 출금 금액 다시 입력" placeholder="같은 금액 다시 입력" />
      `;
      const actions = form.querySelector('.modal-actions');
      if (actions?.parentNode) actions.parentNode.insertBefore(block, actions);
      else form.appendChild(block);
    }
    const input = block.querySelector('[data-putduk-high-repeat]');
    input?.focus();
    setStatus(form, `${Number(amount).toLocaleString('ko-KR')} 고액 출금입니다. 금액을 다시 확인한 뒤 신청해 주세요.`, 'warning');
  }

  function lockDepositCurrency(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const select = form.querySelector('#depositCurrency');
    if (!(select instanceof HTMLSelectElement) || select.dataset.putdukCurrencyLocked === '1') return;

    const selected = String(select.value || 'KRW').toUpperCase();
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'currency';
    hidden.value = selected;
    hidden.dataset.putdukDepositCurrency = '1';
    select.insertAdjacentElement('afterend', hidden);
    select.name = '';
    select.disabled = true;
    select.dataset.putdukCurrencyLocked = '1';
    select.setAttribute('aria-disabled', 'true');

    const help = document.createElement('small');
    help.className = 'putduk-finance-help';
    help.textContent = `${selected === 'USDT' ? 'USDT 지갑' : '원화 계좌'} 안내에 맞춰 통화가 고정돼요.`;
    select.insertAdjacentElement('afterend', help);

    const destination = form.querySelector('input[name="destination_id"]');
    if (!(destination instanceof HTMLInputElement) || !destination.value.trim()) {
      const button = submitButton(form);
      if (button instanceof HTMLButtonElement) button.disabled = true;
      setStatus(form, '현재 사용할 수 있는 입금 안내 목적지를 확인할 수 없어요. 다른 입금 방법을 다시 선택해 주세요.', 'error');
      return;
    }
    ensureStatus(form, '증빙 제출 후 운영자가 입금을 확인해야 업무잔액에 반영됩니다.');
  }

  function enhanceKyc(form) {
    if (!(form instanceof HTMLFormElement)) return;
    ensureStatus(form, '신분증 앞·뒷면과 셀카는 비공개 저장소에 올라가며 운영자가 수동 검수합니다.');
  }

  function enhance(root = document) {
    const deposit = root.querySelector?.('#depositForm') || (root instanceof HTMLFormElement && root.id === 'depositForm' ? root : null);
    if (deposit) lockDepositCurrency(deposit);

    const withdraw = root.querySelector?.('#withdrawForm') || (root instanceof HTMLFormElement && root.id === 'withdrawForm' ? root : null);
    if (withdraw) syncWithdrawMethod(withdraw);

    const kyc = root.querySelector?.('#kycForm') || (root instanceof HTMLFormElement && root.id === 'kycForm' ? root : null);
    if (kyc) enhanceKyc(kyc);
  }

  function parseFinanceRequest(input, init) {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || '');
      if (!url.includes('/functions/v1/member-finance') || typeof init?.body !== 'string') return null;
      const payload = JSON.parse(init.body);
      const action = String(payload?.action || '');
      if (!action) return null;
      return { action, purpose: String(payload?.purpose || ''), payload };
    } catch (_) {
      return null;
    }
  }

  function requestStarted(meta) {
    if (!meta) return;
    if (meta.action === 'set_withdrawal_pin' && document.getElementById('withdrawForm')) {
      const form = document.getElementById('withdrawForm');
      setWithdrawBusy(form, true);
      setStatus(form, '출금 비밀번호를 확인하는 중…', 'busy');
      return;
    }
    if (meta.action === 'withdraw_request' || meta.action === 'submit_withdrawal') {
      const form = document.getElementById('withdrawForm');
      setWithdrawBusy(form, true);
      setStatus(form, '출금 요청을 안전하게 접수하는 중…', 'busy');
      return;
    }
    if (meta.action === 'request_upload' && meta.purpose === 'deposit_proof') {
      setStatus(document.getElementById('depositForm'), '입금 증빙 파일을 안전하게 올리는 중…', 'busy');
      return;
    }
    if (meta.action === 'submit_deposit') {
      setStatus(document.getElementById('depositForm'), '입금 확인 요청을 운영 서버에 접수하는 중…', 'busy');
      return;
    }
    if (meta.action === 'request_upload' && meta.purpose === 'kyc') {
      setStatus(document.getElementById('kycForm'), '본인확인 자료를 비공개 저장소에 올리는 중…', 'busy');
      return;
    }
    if (meta.action === 'submit_kyc') {
      setStatus(document.getElementById('kycForm'), '운영자 검수 요청을 접수하는 중…', 'busy');
    }
  }

  function requestFinished(meta, ok, message = '') {
    if (!meta) return;
    if (meta.action === 'set_withdrawal_pin' && document.getElementById('withdrawForm')) {
      if (!ok) setStatus(document.getElementById('withdrawForm'), message || '출금 비밀번호 확인을 이어서 진행합니다.', 'info');
      return;
    }
    if (meta.action === 'withdraw_request' || meta.action === 'submit_withdrawal') {
      const form = document.getElementById('withdrawForm');
      if (!ok) {
        setWithdrawBusy(form, false);
        setStatus(form, message || '출금 요청을 접수하지 못했어요. 입력 내용을 확인해 주세요.', 'error');
      } else {
        setStatus(form, '출금 신청이 접수됐어요. 운영자가 확인 후 지급 처리합니다.', 'saved');
      }
      return;
    }
    if (meta.action === 'submit_deposit') {
      setStatus(document.getElementById('depositForm'), ok ? '입금 확인 요청이 접수됐어요. 운영자 확인을 기다려 주세요.' : (message || '입금 확인 요청을 접수하지 못했어요.'), ok ? 'saved' : 'error');
      return;
    }
    if (meta.action === 'submit_kyc') {
      setStatus(document.getElementById('kycForm'), ok ? '본인확인 자료가 접수됐어요. 운영자 검수를 기다려 주세요.' : (message || '본인확인 요청을 접수하지 못했어요.'), ok ? 'saved' : 'error');
    }
  }

  window.fetch = async function putdukFinanceFlowFetch(input, init) {
    const meta = parseFinanceRequest(input, init);
    if (meta) requestStarted(meta);
    try {
      const response = await nativeFetch(input, init);
      if (meta) {
        const probe = response.clone();
        void probe.json().then((payload) => {
          const ok = response.ok && payload?.ok === true;
          requestFinished(meta, ok, String(payload?.error || payload?.message || ''));
        }).catch(() => requestFinished(meta, response.ok));
      }
      return response;
    } catch (error) {
      if (meta) requestFinished(meta, false, String(error?.message || ''));
      throw error;
    }
  };

  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || form.id !== 'withdrawForm') return;
    if (form.dataset.putdukWithdrawBusy === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const amount = Number(form.querySelector('#withdrawAmount')?.value || 0);
    if (!Number.isFinite(amount) || amount < HIGH_VALUE_MIN) {
      resetHighConfirmation(form);
      return;
    }

    const method = String(form.querySelector('#withdrawMethod')?.value || 'bank');
    const kind = String(form.querySelector('input[name="withdraw_kind"]')?.value || 'allowance');
    const signature = `${amount}|${method}|${kind}`;
    if (form.dataset.putdukHighConfirmed === signature) return;

    const repeat = form.querySelector('[data-putduk-high-repeat]');
    const repeatedAmount = Number(String(repeat?.value || '').replace(/[^0-9.]/g, ''));
    if (form.dataset.putdukHighPending === signature && repeatedAmount === amount) {
      form.dataset.putdukHighConfirmed = signature;
      setStatus(form, '고액 출금 금액을 다시 확인했어요. 출금 요청을 접수합니다.', 'saved');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    form.dataset.putdukHighPending = signature;
    ensureHighConfirmation(form, amount);
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === 'withdrawMethod') {
      const form = target.closest('#withdrawForm');
      if (form) {
        resetHighConfirmation(form);
        syncWithdrawMethod(form);
      }
    }
  }, true);

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === 'withdrawAmount') {
      const form = target.closest('#withdrawForm');
      if (form) resetHighConfirmation(form);
    }
  }, true);

  function sanitizeStaleFinanceCopy(root) {
    if (!root) return;
    const replace = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const original = String(node.nodeValue || '');
      const next = original
        .replace('운영자가 확인하면 같은 날 지급 처리돼요.', '운영자가 확인 후 지급 처리합니다.')
        .replace('신청하고 처리 중으로', '출금 신청');
      if (next !== original) node.nodeValue = next;
    };
    if (root.nodeType === Node.TEXT_NODE) {
      replace(root);
      return;
    }
    if (!(root instanceof Element)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      replace(node);
      node = walker.nextNode();
    }
  }

  let financeEnhanceScheduled = false;
  function scheduleFinanceEnhance() {
    if (financeEnhanceScheduled) return;
    financeEnhanceScheduled = true;
    window.requestAnimationFrame(() => {
      financeEnhanceScheduled = false;
      const app = document.getElementById('app');
      if (!app) return;
      enhance(app);
      sanitizeStaleFinanceCopy(app);
    });
  }

  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length || record.removedNodes.length)) return;
    scheduleFinanceEnhance();
  });
  const observationRoot = document.getElementById('app') || document.body || document.documentElement;
  observer.observe(observationRoot, { childList: true, subtree: true });

  const style = document.createElement('style');
  style.id = 'putduk-finance-flow-ux-style';
  style.textContent = `
    .putduk-finance-status{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--surface-soft) 74%,transparent);color:var(--muted);font-size:12px;line-height:1.5}
    .putduk-finance-status[data-state="busy"]{color:var(--text)}
    .putduk-finance-status[data-state="saved"]{color:var(--emerald-strong);border-color:color-mix(in srgb,var(--emerald) 30%,var(--line))}
    .putduk-finance-status[data-state="warning"]{color:var(--gold);border-color:color-mix(in srgb,var(--gold) 34%,var(--line))}
    .putduk-finance-status[data-state="error"]{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 30%,var(--line))}
    .putduk-high-withdraw{display:grid;gap:7px;margin:12px 0;padding:12px;border:1px solid color-mix(in srgb,var(--gold) 36%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--gold) 7%,var(--surface-soft))}
    .putduk-high-withdraw strong{font-size:13px}.putduk-high-withdraw span,.putduk-finance-help{color:var(--muted);font-size:11px;line-height:1.45}
    .putduk-high-withdraw input{min-height:44px}
  `;
  document.head.appendChild(style);

  const initialApp = document.getElementById('app') || document;
  enhance(initialApp);
  sanitizeStaleFinanceCopy(initialApp);
})();
