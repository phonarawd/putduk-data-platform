// 체험 수당(트라이얼) KYC 예외 출금 판정. 실제 강제는
// supabase/migrations/20260918120000_putduk_trial_withdraw_kyc_restore.sql의
// putduk_member_withdraw_request() 안 KYC 게이트 블록이 SQL로 한다. 여기 있는
// 함수는 그 판정과 같은 규칙을 프런트·테스트에서 재현한 순수 함수 사본이다.
//
// 규칙: KYC 승인이면 항상 통과. 미승인이면 (원금 미포함 + 통화 KRW +
// 0원 < 금액 <= 3,000원 + 체험 소진 이력 있음)일 때만 예외로 통과하되,
// profiles.trial_withdraw_used_at이 이미 있으면(평생 1회 소진) 거부한다.

export const TRIAL_WITHDRAW_MAX = 3000;
export const TRIAL_WITHDRAW_KYC_REQUIRED = 'KYC_REQUIRED';
export const TRIAL_WITHDRAW_ALREADY_USED = 'TRIAL_WITHDRAW_USED';

export function trialWithdrawGate({
  kycApproved = false,
  trialConsumedAt = null,
  trialWithdrawUsedAt = null,
  amount,
  currency = 'KRW',
  includePrincipal = false
} = {}) {
  if (kycApproved) {
    return { ok: true, reason: 'kyc_approved' };
  }

  const amt = Number(amount);
  const isTrialEligibleAmount =
    !includePrincipal
    && String(currency || '').trim().toUpperCase() === 'KRW'
    && Number.isFinite(amt)
    && amt > 0
    && amt <= TRIAL_WITHDRAW_MAX
    && Boolean(trialConsumedAt);

  if (!isTrialEligibleAmount) {
    return {
      ok: false,
      code: TRIAL_WITHDRAW_KYC_REQUIRED,
      message: '출금 전 본인확인이 필요해요.'
    };
  }

  if (trialWithdrawUsedAt) {
    return {
      ok: false,
      code: TRIAL_WITHDRAW_ALREADY_USED,
      message: '체험 수당 출금은 한 번만 할 수 있어요.'
    };
  }

  return { ok: true, reason: 'trial_exception' };
}
