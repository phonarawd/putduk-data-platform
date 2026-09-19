(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'admin') return;
  if (window.__PUTDUK_BALANCE_ADJUST_SAFETY__) return;
  window.__PUTDUK_BALANCE_ADJUST_SAFETY__ = '20260920-b1';

  function core() {
    return window.PUTDUK_ADMIN_CORE || null;
  }

  function valuesOf(form) {
    const api = core();
    if (api?.formValues) return api.formValues(form);
    return Object.fromEntries(new FormData(form).entries());
  }

  function fail(message) {
    core()?.showToast?.(message, 'warning');
  }

  function setBusy(form, busy) {
    form.dataset.balanceAdjustBusy = busy ? '1' : '0';
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    if (busy) {
      if (!submit.dataset.balanceAdjustLabel) submit.dataset.balanceAdjustLabel = submit.textContent || '';
      submit.disabled = true;
      submit.textContent = '처리 중…';
    } else {
      submit.disabled = false;
      if (submit.dataset.balanceAdjustLabel) submit.textContent = submit.dataset.balanceAdjustLabel;
      delete submit.dataset.balanceAdjustLabel;
    }
  }

  function normalized(form) {
    const values = valuesOf(form);
    const phase = String(form.dataset.phase || values.phase || 'entry').trim();
    const userId = String(values.user_id || '').trim();
    const direction = String(values.direction || '').trim().toLowerCase();
    const amount = Number(values.amount);
    const currency = String(values.currency || 'KRW').trim().toUpperCase();
    const bucket = String(values.bucket || 'available').trim();
    const reason = String(values.reason || '').trim();
    return { values, phase, userId, direction, amount, currency, bucket, reason };
  }

  function validate(payload) {
    if (!payload.userId) return '회원 정보를 다시 열어 주세요.';
    if (!['credit', 'debit'].includes(payload.direction)) return '입금 또는 차감 방향을 확인해 주세요.';
    if (!Number.isFinite(payload.amount) || payload.amount <= 0 || payload.amount > 100000000) return '금액은 1원 이상 1억원 이하로 입력해 주세요.';
    if (!['KRW', 'USDT'].includes(payload.currency)) return '통화를 확인해 주세요.';
    if (!['support_grant', 'work_balance', 'available'].includes(payload.bucket)) return '반영할 잔액 칸을 다시 선택해 주세요.';
    if (!payload.reason) return '운영 기록에 남길 사유를 입력해 주세요.';
    if (payload.reason.length > 500) return '사유는 500자 이내로 입력해 주세요.';
    return '';
  }

  async function refreshMember(userId) {
    const api = core();
    if (!api) return;
    window.PUTDUK_PHASE31?.invalidateMember?.(userId);
    try {
      await api.loadAdminMembers?.({ silent: true });
    } catch (_) {}
    const state = api.getState?.() || {};
    const member = Array.isArray(state.adminMembers)
      ? state.adminMembers.find((item) => String(item?.id || item?.user_id || '') === String(userId))
      : null;
    if (member) {
      api.openModal?.('member-detail', member);
      return;
    }
    api.patchState?.({ modal: null, modalPayload: null, adminMemberDetail: null });
    api.render?.();
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'balanceAdjustForm') return;

    // This form used to share the giant app-level submit chain. Own it in capture phase so
    // unrelated admin wiring cannot swallow the final ledger request or submit it twice.
    event.preventDefault();
    event.stopImmediatePropagation();

    const api = core();
    if (!api?.adminRequest || !api?.openModal) {
      fail('운영자 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    if (form.dataset.balanceAdjustBusy === '1') return;

    const payload = normalized(form);
    const error = validate(payload);
    if (error) {
      fail(error);
      return;
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
      return;
    }

    if (payload.phase !== 'confirm') {
      fail('잔액 조정 단계를 다시 열어 주세요.');
      return;
    }

    setBusy(form, true);
    try {
      await api.adminRequest('adjust_balance', {
        user_id: payload.userId,
        direction: payload.direction,
        amount: payload.amount,
        currency: payload.currency,
        reason: payload.reason,
        bucket: payload.bucket
      });
      api.showToast?.(
        payload.direction === 'credit' ? '✅ 잔액 입금을 반영했어요.' : '✅ 잔액 차감을 반영했어요.',
        'success'
      );
      await refreshMember(payload.userId);
    } catch (requestError) {
      const message = api.friendlyAdminError?.(requestError)
        || String(requestError?.message || '잔액을 반영하지 못했습니다.');
      api.showToast?.(message, 'error');
      setBusy(form, false);
    }
  }, true);
})();
