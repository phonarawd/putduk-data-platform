// 입금 USDT 주소 정책. 화면만 바꾸고 서버 추적을 깨면 안 된다.
//
// operator_fixed (현재): 운영자가 private.payout_destinations에 등록한 고정 TRC20.
// 입금 식별은 destination_id + 금액 + 증빙 + 운영자 대조. 주소가 바뀌면 같은 행의
// info_version·catalog_version이 올라가고 이전 공개 토큰은 무효가 된다.
// destination_id는 유지해 deposit_requests 추적을 이어 간다.
//
// per_user_trc20: 회원별 주소 자동생성. 키 보관·입금 매칭 엔진이 이 레포에 없어 사용 금지.
// 화면만 유저별 주소로 바꾸면 서버가 누구 돈인지 모른다.

export const USDT_DEPOSIT_ADDRESS_MODE = 'operator_fixed';
export const USDT_DEPOSIT_NETWORK_DEFAULT = 'TRC20';
export const USDT_DEPOSIT_IDENTIFICATION = Object.freeze([
  'destination_id',
  'amount',
  'proof',
  'operator_match'
]);

export function assertUsdtDepositPolicy(mode = USDT_DEPOSIT_ADDRESS_MODE) {
  if (mode !== 'operator_fixed') {
    throw new Error('회원별 USDT 자동생성은 입금 추적 엔진이 없어 사용할 수 없어요.');
  }
  return mode;
}

export function usdtDepositTrackable(payload = {}) {
  const mode = payload.address_mode || payload.usdt_address_mode || USDT_DEPOSIT_ADDRESS_MODE;
  const destinationId = String(payload.destination_id || '').trim();
  const network = String(payload.usdt_network || USDT_DEPOSIT_NETWORK_DEFAULT).toUpperCase();
  return mode === 'operator_fixed' && Boolean(destinationId) && network === 'TRC20';
}

export function bumpDestinationVersion(previous = 0, { addressChanged = false, reason = '' } = {}) {
  const base = Number(previous || 0);
  if (!addressChanged) return base || 1;
  if (!String(reason || '').trim()) {
    throw new Error('USDT 주소를 바꿀 때는 변경 사유를 남겨야 추적이 유지돼요.');
  }
  return (base || 0) + 1;
}
