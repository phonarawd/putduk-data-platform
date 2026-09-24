(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const config = window.PUTDUK_CONFIG || {};
  const EDGE_URL = config.memberFinanceUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/member-finance` : '');
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const MAX_BYTES = 10 * 1024 * 1024;
  const HIGH_JUMP_MIN = 3000000;
  let client = null;
  let highPending = null;

  function financeClient() {
    if (client) return client;
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    client = window.__PUTDUK_SUPABASE_CLIENT__ || window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    window.__PUTDUK_SUPABASE_CLIENT__ = client;
    return client;
  }

  function toast(text, kind = 'info') {
    if (typeof window.__putdukShowToast === 'function') {
      window.__putdukShowToast(text, kind);
    }
  }

  async function edge(action, payload = {}) {
    const api = financeClient();
    if (!api || !EDGE_URL) throw new Error('입금 서버 연결을 확인해 주세요.');
    const sessionResult = await api.auth.getSession();
    const session = sessionResult.data?.session;
    if (!session?.access_token) throw new Error('로그인 후 입금 확인을 요청할 수 있어요.');
    const response = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || result?.message || '요청을 처리하지 못했어요.');
    }
    return result;
  }

  function proofFile(form) {
    return form?.querySelector('#depositProofFile')?.files?.[0] || null;
  }

  function validateProof(file) {
    if (!file) throw new Error('입금 이체내역 또는 전송 증빙 파일을 올려 주세요.');
    if (!ALLOWED_TYPES.has(String(file.type || '').toLowerCase())) {
      throw new Error('입금 증빙은 JPG, PNG, WEBP, PDF만 올릴 수 있어요.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error('입금 증빙은 10MB 이하 파일만 올릴 수 있어요.');
    }
    return file;
  }

  function readDeposit(form) {
    const data = new FormData(form);
    return {
      amount: Number(data.get('amount') || 0),
      currency: String(data.get('currency') || 'KRW').toUpperCase(),
      destination_id: String(data.get('destination_id') || '').trim() || null,
      file: validateProof(proofFile(form))
    };
  }

  async function uploadProof(file) {
    const ticket = await edge('request_upload', {
      purpose: 'deposit_proof',
      file_name: file.name,
      content_type: file.type
    });
    const upload = ticket?.upload;
    if (!upload?.bucket || !upload?.path || !upload?.token) {
      throw new Error('입금 증빙 업로드 주소를 만들지 못했어요.');
    }
    const api = financeClient();
    const result = await api.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: file.type,
        upsert: false
      });
    if (result.error) throw new Error('입금 증빙 파일을 올리지 못했어요.');
    return upload.path;
  }

  function setBusy(form, busy) {
    if (!form) return;
    form.dataset.phase4Busy = busy ? '1' : '0';
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.phase4Label) button.dataset.phase4Label = button.textContent || '입금 확인 요청';
    button.disabled = busy;
    button.textContent = busy ? '증빙 확인 중…' : button.dataset.phase4Label;
  }

  function closeDepositFlow() {
    if (typeof window.__putdukCloseFinanceModal === 'function') {
      window.__putdukCloseFinanceModal();
      return;
    }
    const direct = document.querySelector('[data-modal="info"] [data-action="close-modal"], [data-modal="deposit"] [data-action="close-modal"]');
    if (direct) {
      direct.click();
      return;
    }
    const back = document.querySelector('[data-modal="deposit-jump"] [data-action="back-deposit"]');
    if (back) {
      back.click();
      queueMicrotask(() => document.querySelector('[data-action="close-modal"]')?.click());
    }
  }

  async function submitDeposit(values, form) {
    if (!values.amount || values.amount < 1000 || values.amount > 100000000) {
      throw new Error('입금 금액은 1,000원 이상으로 입력해 주세요.');
    }
    setBusy(form, true);
    try {
      const path = await uploadProof(values.file);
      await edge('submit_deposit', {
        amount: values.amount,
        currency: values.currency,
        proof_path: path,
        destination_id: values.destination_id,
        note: null
      });
      highPending = null;
      closeDepositFlow();
      queueMicrotask(() => toast('✅ 입금 신청을 접수했어요. 운영자가 확인하면 잔액에 반영돼요.', 'success'));
    } finally {
      setBusy(form, false);
    }
  }

  function augmentDepositForm(form) {
    if (!form || form.dataset.phase4FinanceWired === '1') return;
    const amount = form.querySelector('#depositAmount');
    if (amount) amount.min = '1000';
    if (form.querySelector('#depositProofFile')) {
      form.dataset.phase4FinanceWired = '1';
      return;
    }
    const actions = form.querySelector('.modal-actions');
    if (!actions) return;
    form.dataset.phase4FinanceWired = '1';
    const field = document.createElement('div');
    field.className = 'field full';
    field.innerHTML = `<label for="depositProofFile">입금 증빙</label>
      <input id="depositProofFile" name="proof_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
      <small style="color:var(--muted)">이체내역·전송 화면을 JPG, PNG, WEBP, PDF로 올려 주세요. 최대 10MB예요.</small>`;
    actions.before(field);
  }

  function scan() {
    augmentDepositForm(document.getElementById('depositForm'));
  }

  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;

    if (form.id === 'depositForm') {
      let values;
      try {
        values = readDeposit(form);
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast(error?.message || '입금 증빙을 확인해 주세요.', 'warning');
        return;
      }
      if (values.amount >= HIGH_JUMP_MIN) {
        highPending = values;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (form.dataset.phase4Busy === '1') return;
      submitDeposit(values, form).catch((error) => {
        toast(error?.message || '입금 신청을 접수하지 못했어요.', 'error');
      });
      return;
    }

    if (form.id === 'depositJumpForm') {
      if (!highPending) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const typed = String(document.getElementById('depositJumpRepeat')?.value || '').replace(/\D/g, '');
      const slid = Number(document.getElementById('depositJumpSlide')?.value || 0) >= 100;
      if (typed !== String(highPending.amount) && !slid) {
        toast('같은 금액을 다시 적거나, 아래를 밀어 확정해 주세요.', 'info');
        return;
      }
      if (form.dataset.phase4Busy === '1') return;
      submitDeposit(highPending, form).catch((error) => {
        toast(error?.message || '입금 신청을 접수하지 못했어요.', 'error');
      });
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    if (['back-deposit', 'close-modal', 'logout'].includes(target.dataset.action || '')) {
      highPending = null;
    }
  }, true);

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    window.requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length || record.removedNodes.length)) return;
    scheduleScan();
  });

  function boot() {
    scan();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
