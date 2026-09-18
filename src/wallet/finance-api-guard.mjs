// 입출금 전체 오픈(자동 정산/PG)은 화면 플래그만으로 열지 않는다. Edge도 같은 규칙을 본다.
// KYC/PG 전에는 PUTDUK_ENABLE_FINANCE_API 와 enableFinanceApi 가 true가 아니어야 한다.
// true는 자동 잔액 반영·PG를 뜻한다. 회원 신청 → 운영자 큐는 아래 신청 액션으로 연다.
// 꺼진 상태의 예외: 체험 근무로 확정된 수당 3천 원 출금 신청(운영 경로).
// 지원금 1만 원 자체는 출금하지 않는다. 실제 송금은 운영자가 수동 처리한다.

export const FINANCE_API_CLOSED = 'FINANCE_API_CLOSED';
export const OPS_TRIAL_WITHDRAW_MAX = 3000;

export const FINANCE_ALWAYS_ALLOWED_ACTIONS = Object.freeze([
  'record_session',
  'set_security_pin',
  'security_pin_set',
  'deposit_destinations',
  'deposit_info_challenge',
  'deposit_info',
  'deposit_info_reveal',
  'deposit_info_lock',
  'wallet',
  'wallet_snapshot',
  'set_withdrawal_pin',
  'lock_stake',
  'start_lock',
  'checkpoint_work',
  'save_checkpoint',
  'submit_work',
  'submit_task',
  'submit_run',
  'submit_kyc',
  'request_upload',
  'daily_task_quota',
  'work_quota'
]);

export const FINANCE_APPLICATION_ACTIONS = Object.freeze([
  'submit_deposit',
  'submit_withdrawal',
  'withdraw_request'
]);

const always = new Set(FINANCE_ALWAYS_ALLOWED_ACTIONS);
const application = new Set(FINANCE_APPLICATION_ACTIONS);

export function isFinanceApiOpen(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function isOpsTrialWithdraw(payload = {}) {
  const kind = String(payload.kind || payload.withdraw_kind || '').trim().toLowerCase();
  const principal = payload.include_principal === true
    || payload.includePrincipal === true
    || ['principal', '원금', '원금포함', 'include_principal'].includes(kind)
    || ['1', 'true', 'yes', '원금포함', '원금', 'include_principal', 'principal']
      .includes(String(payload.include_principal ?? '').trim().toLowerCase());
  const amount = Number(payload.amount);
  const currency = String(payload.currency || 'KRW').trim().toUpperCase();
  return !principal
    && currency === 'KRW'
    && Number.isFinite(amount)
    && amount > 0
    && amount <= OPS_TRIAL_WITHDRAW_MAX;
}

export function financeActionGuard({
  open = false,
  action = '',
  amount,
  includePrincipal,
  kind,
  currency
} = {}) {
  const name = String(action || '');
  if (always.has(name)) return { ok: true };
  if (application.has(name)) {
    return { ok: true };
  }
  if (open) return { ok: true };
  if (name === 'submit_withdrawal' || name === 'withdraw_request') {
    if (isOpsTrialWithdraw({ amount, include_principal: includePrincipal, kind, currency })) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      code: FINANCE_API_CLOSED,
      message: '출금 신청은 운영자가 확인한 뒤에 지급돼요. 체험 수당 3천 원은 운영 경로로만 신청돼요.'
    };
  }
  if (name === 'submit_deposit') {
    return {
      ok: false,
      status: 403,
      code: FINANCE_API_CLOSED,
      message: '입금 신청은 운영자가 확인한 뒤에 잔액에 반영돼요.'
    };
  }
  return { ok: true };
}
