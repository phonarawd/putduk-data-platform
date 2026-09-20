(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'admin') return;
  if (window.__PUTDUK_ADMIN_FINANCE_QUEUE_GUARD__) return;
  window.__PUTDUK_ADMIN_FINANCE_QUEUE_GUARD__ = '20260920-p2finance1';

  const core = window.PUTDUK_ADMIN_CORE;
  const admin = window.PUTDUK_ADMIN;
  if (!core?.adminRequest || !core?.getState || !core?.patchState || !admin) return;

  const busy = new Set();
  let depositPreview = null;
  let previewTimer = 0;

  function finance() {
    return core.getState()?.adminFinance || { deposits: [], withdrawals: [], kyc: [] };
  }

  function toast(message, type = 'info') {
    core.showToast?.(message, type);
  }

  function amountText(item) {
    const currency = String(item?.currency || 'KRW').toUpperCase();
    const amount = Number(item?.amount || 0);
    if (!Number.isFinite(amount)) return '확인 필요';
    if (currency === 'USDT') {
      return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 8 })} USDT`;
    }
    return `${Math.round(amount).toLocaleString('ko-KR')}원`;
  }

  function isPrincipal(item) {
    return item?.include_principal === true
      || item?.principal_included === true
      || Number(item?.principal_amount || 0) > 0
      || item?.kind_label === '원금포함';
  }

  function depositById(id) {
    return (finance().deposits || []).find((item) => String(item.id) === String(id));
  }

  function withdrawalById(id) {
    return (finance().withdrawals || []).find((item) => String(item.id) === String(id));
  }

  function kycByUser(userId) {
    return (finance().kyc || []).find((item) => String(item.id || item.user_id) === String(userId));
  }

  function busyKey(kind, id) {
    return `${kind}:${String(id || '')}`;
  }

  function setBusy(kind, id, value) {
    const key = busyKey(kind, id);
    if (value) busy.add(key);
    else busy.delete(key);
    enhanceFinancePage();
  }

  function isBusy(kind, id) {
    return busy.has(busyKey(kind, id));
  }

  async function refreshFinance() {
    if (typeof core.loadAdminFinance === 'function') await core.loadAdminFinance({ silent: true });
    core.render?.();
  }

  function requireReason(label) {
    const reason = String(window.prompt(`${label} 사유를 입력해 주세요.`) || '').trim();
    if (!reason) {
      toast(`${label} 사유를 입력해 주세요.`, 'warning');
      return null;
    }
    return reason;
  }

  async function reviewDeposit(id, decision) {
    const item = depositById(id);
    if (!item || isBusy('deposit', id)) return;
    if (decision === 'approved' && !String(item.proof_path || '').trim()) {
      toast('입금 증빙이 없는 요청은 승인할 수 없어요.', 'warning');
      return;
    }
    const approved = decision === 'approved';
    if (!window.confirm(approved
      ? `입금 증빙을 확인했고 ${amountText(item)} 입금을 승인할까요? 업무잔액에 반영됩니다.`
      : '이 입금 요청을 반려할까요?')) return;
    const reason = approved ? null : requireReason('반려');
    if (!approved && !reason) return;

    setBusy('deposit', id, true);
    try {
      await core.adminRequest('review_deposit', { deposit_id: id, request_id: id, decision, reason });
      if (depositPreview?.id === String(id)) clearDepositPreview(false);
      await refreshFinance();
      toast(approved ? '입금 확인을 승인했어요. 업무잔액에 반영됐어요.' : '입금 요청을 반려했어요.', 'success');
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '입금 처리를 저장하지 못했어요.', 'error');
    } finally {
      setBusy('deposit', id, false);
    }
  }

  async function rejectWithdrawal(id) {
    const item = withdrawalById(id);
    if (!item || isBusy('withdrawal', id)) return;
    if (isPrincipal(item)) {
      toast('원금 포함 출금은 반려할 수 없어요. 실제 송금 후 완료로 표시해 주세요.', 'warning');
      return;
    }
    if (!window.confirm(`수당 출금 ${amountText(item)} 요청을 반려할까요?`)) return;
    const reason = requireReason('반려');
    if (!reason) return;

    setBusy('withdrawal', id, true);
    try {
      await core.adminRequest('review_withdrawal', { withdrawal_id: id, request_id: id, decision: 'rejected', reason });
      await refreshFinance();
      toast('수당 출금 요청을 반려했고 보류 금액을 되돌렸어요.', 'success');
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '출금 반려를 저장하지 못했어요.', 'error');
    } finally {
      setBusy('withdrawal', id, false);
    }
  }

  async function revealWithdrawal(id) {
    if (!withdrawalById(id) || isBusy('reveal', id)) return;
    setBusy('reveal', id, true);
    try {
      const result = await core.adminRequest('reveal_withdrawal_destination', { withdrawal_id: id });
      core.patchState({ adminWithdrawalReveal: { withdrawal_id: id, ...result } });
      core.render?.();
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '지급정보를 열지 못했어요.', 'error');
    } finally {
      setBusy('reveal', id, false);
    }
  }

  async function completeWithdrawal(id) {
    const item = withdrawalById(id);
    if (!item || isBusy('withdrawal', id)) return;
    const revealed = String(core.getState()?.adminWithdrawalReveal?.withdrawal_id || '') === String(id);
    if (!revealed) {
      toast('지급정보를 먼저 확인하고 실제 송금을 완료한 뒤 완료로 표시해 주세요.', 'warning');
      return;
    }
    if (!window.confirm(`실제 ${item.currency === 'USDT' ? 'USDT 전송' : '은행 송금'} ${amountText(item)}을 완료했나요? 완료 표시 후 회원 잔액과 내역이 서버에서 확정됩니다.`)) return;

    setBusy('withdrawal', id, true);
    try {
      await core.adminRequest('withdraw_complete', { withdrawal_id: id });
      core.patchState({ adminWithdrawalReveal: null });
      await refreshFinance();
      toast('실제 송금 완료 상태로 기록했어요. 회원 잔액과 내역이 서버에서 확정됐어요.', 'success');
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '출금 완료를 저장하지 못했어요.', 'error');
    } finally {
      setBusy('withdrawal', id, false);
    }
  }

  async function reviewKyc(userId, decision) {
    const item = kycByUser(userId);
    if (!item || isBusy('kyc', userId)) return;
    if (!['review_pending', 'submitted'].includes(String(item.kyc_status || ''))) {
      toast('이미 처리되었거나 검수 대기 상태가 아닌 본인확인입니다.', 'warning');
      return;
    }
    const approved = decision === 'approved';
    if (!window.confirm(approved ? '신분증 앞·뒤와 셀카를 모두 확인하고 승인할까요?' : '이 본인확인을 반려할까요?')) return;
    const reason = approved ? null : requireReason('반려');
    if (!approved && !reason) return;

    setBusy('kyc', userId, true);
    try {
      await core.adminRequest('review_kyc', { user_id: userId, decision, reason });
      core.patchState({ adminKycPreview: null });
      await refreshFinance();
      toast(approved ? '본인확인을 승인했어요.' : '본인확인을 반려했어요.', approved ? 'success' : 'warning');
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '본인확인 처리를 저장하지 못했어요.', 'error');
    } finally {
      setBusy('kyc', userId, false);
    }
  }

  function clearDepositPreview(render = true) {
    depositPreview = null;
    window.clearTimeout(previewTimer);
    previewTimer = 0;
    document.querySelector('[data-putduk-deposit-preview]')?.remove();
    if (render) enhanceFinancePage();
  }

  async function previewDepositProof(id) {
    const item = depositById(id);
    const path = String(item?.proof_path || '').trim();
    if (!item || !path || isBusy('proof', id)) {
      if (item && !path) toast('이 요청에는 입금 증빙이 없어요.', 'warning');
      return;
    }
    setBusy('proof', id, true);
    try {
      const result = await core.adminRequest('preview_private_file', { path, purpose: 'deposit_proof' });
      depositPreview = {
        id: String(id),
        url: String(result.signed_url || ''),
        pdf: path.toLowerCase().endsWith('.pdf'),
        expiresAt: Date.now() + Number(result.expires_in || 60) * 1000
      };
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => clearDepositPreview(true), Math.max(1000, Number(result.expires_in || 60) * 1000));
      enhanceFinancePage();
    } catch (error) {
      toast(core.friendlyAdminError?.(error) || error?.message || '입금 증빙을 열지 못했어요.', 'error');
    } finally {
      setBusy('proof', id, false);
    }
  }

  function replaceCopy() {
    const pageCopy = document.querySelector('.page-title')?.textContent?.trim() === '입출금 처리'
      ? document.querySelector('.page-title')?.closest('.section-heading')?.querySelector('.page-copy')
      : null;
    if (pageCopy) pageCopy.textContent = '실제 입금·송금 확인 후 상태만 확정합니다. 회원 잔액은 서버 원장이 변경합니다.';

    document.querySelectorAll('.admin-card h3').forEach((heading) => {
      if (heading.textContent?.trim() !== '출금 신청 목록') return;
      const copy = heading.parentElement?.querySelector('p');
      if (copy) copy.textContent = '지급정보를 확인하고 실제 은행·USDT 송금을 마친 뒤 완료로 표시하세요.';
    });
  }

  function enhanceWithdrawals() {
    const revealedId = String(core.getState()?.adminWithdrawalReveal?.withdrawal_id || '');
    for (const item of finance().withdrawals || []) {
      const id = String(item.id || '');
      if (!id) continue;
      document.querySelectorAll(`[data-withdrawal-id="${id}"]`).forEach((button) => {
        const action = button.dataset.action;
        if (action === 'reveal-withdrawal-destination') {
          button.textContent = isBusy('reveal', id) ? '불러오는 중…' : '지급정보 확인';
          button.disabled = isBusy('reveal', id);
        }
        if (action === 'withdraw-complete') {
          button.textContent = isBusy('withdrawal', id) ? '저장 중…' : (revealedId === id ? '송금 완료 표시' : '지급정보 확인 후 완료');
          button.disabled = isBusy('withdrawal', id) || revealedId !== id;
        }
      });

      document.querySelectorAll(`[data-finance-action="review_withdrawal"][data-finance-id="${id}"]`).forEach((button) => {
        if (isPrincipal(item)) {
          button.remove();
          return;
        }
        button.disabled = isBusy('withdrawal', id);
      });

      if (isPrincipal(item)) {
        const anchor = document.querySelector(`[data-withdrawal-id="${id}"]`);
        const row = anchor?.closest('tr, .admin-mobile-card');
        if (row && !row.querySelector('[data-putduk-principal-rule]')) {
          const note = document.createElement('small');
          note.dataset.putdukPrincipalRule = '1';
          note.textContent = '원금 포함 출금은 반려 없이 실제 송금 후 완료만 가능합니다.';
          note.style.display = 'block';
          note.style.marginTop = '8px';
          note.style.color = 'var(--muted)';
          row.appendChild(note);
        }
      }
    }
  }

  function enhanceDeposits() {
    const deposits = finance().deposits || [];
    const heading = [...document.querySelectorAll('.admin-card h3')].find((node) => node.textContent?.trim() === '입금 확인');
    const card = heading?.closest('.admin-card');
    if (!card) return;

    const rows = [...card.querySelectorAll('.table-wrap tbody tr')];
    deposits.forEach((item, index) => {
      const row = rows[index];
      if (row) {
        const amountCell = row.querySelectorAll('td')[1];
        if (amountCell) amountCell.textContent = amountText(item);
      }

      const id = String(item.id || '');
      if (!id) return;
      const actionButtons = card.querySelectorAll(`[data-finance-id="${id}"]`);
      actionButtons.forEach((button) => {
        button.disabled = isBusy('deposit', id) || (button.dataset.financeDecision === 'approved' && !String(item.proof_path || '').trim());
      });

      const approve = card.querySelector(`[data-finance-action="review_deposit"][data-finance-id="${id}"]`);
      const actionRow = approve?.closest('.action-row');
      if (actionRow && !actionRow.querySelector(`[data-action="deposit-proof-preview"][data-deposit-id="${id}"]`)) {
        const proof = document.createElement('button');
        proof.type = 'button';
        proof.className = 'small-button';
        proof.dataset.action = 'deposit-proof-preview';
        proof.dataset.depositId = id;
        proof.textContent = String(item.proof_path || '').trim() ? '증빙 보기' : '증빙 없음';
        proof.disabled = !String(item.proof_path || '').trim() || isBusy('proof', id);
        actionRow.prepend(proof);
      }

      card.querySelectorAll(`.admin-mobile-card [data-finance-id="${id}"]`).forEach((button) => {
        const mobile = button.closest('.admin-mobile-card');
        const amountLine = mobile?.querySelector('p');
        if (amountLine) amountLine.textContent = amountText(item);
      });
    });

    renderDepositPreview(card);
  }

  function renderDepositPreview(card) {
    card.querySelector('[data-putduk-deposit-preview]')?.remove();
    if (!depositPreview?.url || depositPreview.expiresAt <= Date.now()) return;
    const item = depositById(depositPreview.id);
    if (!item) return;

    const panel = document.createElement('div');
    panel.dataset.putdukDepositPreview = '1';
    panel.className = 'notice';
    panel.style.marginTop = '16px';
    panel.style.display = 'block';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.gap = '12px';
    const title = document.createElement('strong');
    title.textContent = `입금 증빙 미리보기 · ${amountText(item)}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'small-button';
    close.dataset.action = 'close-deposit-proof-preview';
    close.textContent = '닫기';
    head.append(title, close);
    panel.appendChild(head);

    const note = document.createElement('p');
    note.textContent = '비공개 저장소의 60초 임시 주소입니다. 승인 전에 금액·송금자·통화를 직접 확인하세요.';
    note.style.margin = '8px 0';
    panel.appendChild(note);

    if (depositPreview.pdf) {
      const link = document.createElement('a');
      link.className = 'primary-button';
      link.href = depositPreview.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'PDF 증빙 열기';
      panel.appendChild(link);
    } else {
      const image = document.createElement('img');
      image.src = depositPreview.url;
      image.alt = '입금 증빙';
      image.style.maxWidth = '100%';
      image.style.maxHeight = '420px';
      image.style.objectFit = 'contain';
      image.style.borderRadius = '12px';
      panel.appendChild(image);
    }
    card.appendChild(panel);
  }

  function enhanceKyc() {
    for (const item of finance().kyc || []) {
      const userId = String(item.id || item.user_id || '');
      if (!userId) continue;
      document.querySelectorAll(`[data-kyc-user="${userId}"]`).forEach((button) => {
        if (button.dataset.action === 'kyc-approve' || button.dataset.action === 'kyc-reject') {
          button.disabled = isBusy('kyc', userId);
          if (isBusy('kyc', userId)) button.textContent = '처리 중…';
        }
      });
    }
  }

  function enhanceFinancePage() {
    if (core.getState()?.adminPage !== 'finance') return;
    replaceCopy();
    enhanceWithdrawals();
    enhanceDeposits();
    enhanceKyc();
    document.querySelectorAll('.admin-card button, .finance-tabs button').forEach((button) => {
      button.style.minHeight = '44px';
    });
  }

  const nativeAfterRender = typeof admin.afterRender === 'function' ? admin.afterRender.bind(admin) : null;
  admin.afterRender = function putdukAdminFinanceAfterRender(...args) {
    const result = nativeAfterRender ? nativeAfterRender(...args) : undefined;
    enhanceFinancePage();
    return result;
  };

  document.addEventListener('click', (event) => {
    if (core.getState()?.adminPage !== 'finance') return;
    const target = event.target?.closest?.('[data-action], [data-finance-action]');
    if (!target) return;

    if (target.dataset.action === 'deposit-proof-preview') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void previewDepositProof(target.dataset.depositId);
      return;
    }
    if (target.dataset.action === 'close-deposit-proof-preview') {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearDepositPreview(true);
      return;
    }
    if (target.dataset.financeAction === 'review_deposit') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void reviewDeposit(target.dataset.financeId, target.dataset.financeDecision || 'approved');
      return;
    }
    if (target.dataset.financeAction === 'review_withdrawal') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target.dataset.financeDecision === 'rejected') void rejectWithdrawal(target.dataset.financeId);
      return;
    }
    if (target.dataset.action === 'reveal-withdrawal-destination') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void revealWithdrawal(target.dataset.withdrawalId);
      return;
    }
    if (target.dataset.action === 'withdraw-complete') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void completeWithdrawal(target.dataset.withdrawalId);
      return;
    }
    if (target.dataset.action === 'kyc-approve' || target.dataset.action === 'kyc-reject') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void reviewKyc(target.dataset.kycUser, target.dataset.action === 'kyc-approve' ? 'approved' : 'rejected');
    }
  }, true);

  enhanceFinancePage();
})();
