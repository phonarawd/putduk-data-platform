// 근무 실행 상태. 클라이언트 타이머가 아니라 서버 status 기준.

export const ACTIVE_RUN_STATUSES = ['reserved', 'in_progress', 'checkpointed'];
export const REVIEW_WAIT_STATUSES = ['submitted', 'under_review', 'review_pending'];
export const REWORK_STATUSES = ['rework'];
export const REJECTED_STATUSES = ['rejected'];
export const APPROVED_STATUSES = ['approved'];

export function runStatusLabel(status) {
  return ({
    reserved: '출근 대기',
    in_progress: '근무 중',
    checkpointed: '중간 저장',
    submitted: '검수 대기',
    under_review: '검수 중',
    review_pending: '검수 대기',
    approved: '검수 완료',
    rework: '재확인 요청',
    rejected: '반려',
    cancelled: '취소'
  })[String(status || '')] || '처리 중';
}

export function isActiveRun(status) {
  return ACTIVE_RUN_STATUSES.includes(String(status || ''));
}

export function isReviewWait(status) {
  return REVIEW_WAIT_STATUSES.includes(String(status || ''));
}

export function blocksNewStart(status) {
  const raw = String(status || '');
  return isActiveRun(raw) || isReviewWait(raw) || REWORK_STATUSES.includes(raw);
}

export function isPostedReward(rewardStatus, runStatus) {
  const posted = ['posted', 'paid', 'settled', 'available'].includes(String(rewardStatus || '').toLowerCase());
  return posted && APPROVED_STATUSES.includes(String(runStatus || ''));
}

export function rewardUiKind(run) {
  const status = String(run?.status || '');
  const rewardStatus = String(run?.reward_status || run?.rewardStatus || '');
  if (isReviewWait(status)) return 'review_wait';
  if (REWORK_STATUSES.includes(status)) return 'rework';
  if (REJECTED_STATUSES.includes(status)) return 'rejected';
  if (isPostedReward(rewardStatus, status)) return 'posted';
  if (APPROVED_STATUSES.includes(status)) return 'approved_unposted';
  if (isActiveRun(status)) return 'expected';
  return 'expected';
}

export function rewardUiLabel(kind) {
  return ({
    expected: '예상 보상',
    review_wait: '예상 보상 · 검수 대기',
    rework: '예상 보상 · 재확인',
    rejected: '보상 없음',
    approved_unposted: '확정 대기',
    posted: '확정 보상'
  })[kind] || '예상 보상';
}

export function sanitizeMemberNotice(text) {
  let copy = String(text || '');
  copy = copy.replace(/(\d{1,3}(?:,\d{3})*)\.00원/g, '$1원');
  copy = copy.replace(/운영자 안내[·\s]*테스트/g, '');
  copy = copy.replace(/운영자 안내/g, '');
  copy = copy.replace(/(^|[^\w가-힣])테스트(?=[^\w가-힣]|$)/g, '$1');
  copy = copy.replace(/수당\s*[\d,]+원이 출금 가능에 들어왔어요\.?/g, '검수가 끝났어요. 출금 가능 금액은 지갑에서 확인해요.');
  copy = copy.replace(/출금 가능으로 반영/g, '검수 완료로 기록');
  copy = copy.replace(/출금 가능에 (들어왔어요|반영됐어요)/g, '검수 완료로 기록됐어요');
  copy = copy.replace(/지급 완료/g, '검수 완료');
  copy = copy.replace(/운영자가 확인합니다\.?/g, '');
  copy = copy.replace(/\s*·\s*:/g, '');
  copy = copy.replace(/\s*·\s*$/g, '');
  copy = copy.replace(/\s{2,}/g, ' ').trim();
  if (/^[\d,]+원$/.test(copy)) return '처리 기록이 있어요. 금액은 지갑에서 확인해요.';
  return copy;
}
