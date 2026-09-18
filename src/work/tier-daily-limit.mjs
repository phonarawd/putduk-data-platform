// 회원 등급별 하루 업무 시작 한도. 실제 강제는 DB 트리거
// (private.prepare_putduk_task_run, supabase/migrations/20260918110000_*)가 하고,
// 여기 있는 함수들은 그 SQL 로직과 같은 규칙을 프런트·테스트에서 재사용하기 위한
// 순수 함수 사본이다. 실제 한도 숫자는 항상 서버(putduk_member_daily_task_quota)
// 응답을 기준으로 하고, 아래 DEFAULT_TIER_DAILY_LIMITS는 그 값을 아직 못 받았을 때만
// 참고하는 임시 기본값이다(2026-09-18 야간 세션이 정한 값, 확정 기획 수치 아님).

export const BADGE_TIERS = ['라인', '크루', '선임', '전담'];

const TIER_ALIASES = {
  '일반 파트너': '라인',
  '인증 파트너': '크루',
  '우수 파트너': '선임',
  '글로벌 디렉터': '전담',
  '라인': '라인',
  '크루': '크루',
  '선임': '선임',
  '전담': '전담'
};

// 임시 기본값. 운영자가 putduk_admin_set_tier_daily_limit로 바꾸면 서버 값이 우선한다.
export const DEFAULT_TIER_DAILY_LIMITS = Object.freeze({
  '라인': 3,
  '크루': 5,
  '선임': 10,
  '전담': 0
});

export function normalizeMemberTier(rawTier) {
  const key = String(rawTier || '').trim();
  return TIER_ALIASES[key] || '라인';
}

export function defaultDailyLimitForTier(rawTier) {
  const tier = normalizeMemberTier(rawTier);
  return DEFAULT_TIER_DAILY_LIMITS[tier] ?? 0;
}

// 서버와 같은 우선순위: 회원 예외 → 등급 한도 → 추가 횟수. 무제한(0)에는 추가 횟수를 더하지 않는다.
export function effectiveDailyCap({ tierLimit, override, extra } = {}) {
  const extraStarts = Math.max(0, Math.trunc(Number(extra || 0)));
  const hasOverride = override != null && override !== '';
  const base = hasOverride
    ? Math.max(0, Math.trunc(Number(override)))
    : Math.max(0, Math.trunc(Number(tierLimit ?? 0)));
  const unlimited = base <= 0;
  return {
    unlimited,
    base,
    extra: extraStarts,
    cap: unlimited ? 0 : base + extraStarts
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' 와 동일한
// 결과(오늘 KST 자정을 나타내는 절대 시각)를 JS Date로 계산한다. 한국은 서머타임이 없어
// 고정 UTC+9 오프셋으로 계산해도 안전하다.
export function kstDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnightAsUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(kstMidnightAsUtc - KST_OFFSET_MS);
}

export function kstDayRange(now = new Date()) {
  const start = kstDayStart(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isWithinKstDay(createdAt, now = new Date()) {
  const at = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(at.getTime())) return false;
  const { start, end } = kstDayRange(now);
  return at.getTime() >= start.getTime() && at.getTime() < end.getTime();
}

// putduk_member_daily_task_quota RPC 응답과 같은 모양을 순수 함수로 재현한다.
export function dailyQuotaSummary({ tier, limit, used, now = new Date() } = {}) {
  const tierLabel = normalizeMemberTier(tier);
  const dailyLimit = Math.max(0, Number(limit ?? defaultDailyLimitForTier(tierLabel)) || 0);
  const usedToday = Math.max(0, Number(used || 0));
  const unlimited = dailyLimit <= 0;
  const { end } = kstDayRange(now);
  return {
    tier: tierLabel,
    daily_limit: dailyLimit,
    used_today: usedToday,
    remaining_today: unlimited ? null : Math.max(dailyLimit - usedToday, 0),
    unlimited,
    resets_at: end
  };
}

export function dailyQuotaLabel(quota) {
  if (!quota) return '';
  if (quota.unlimited) return '오늘 작업 횟수 제한이 없어요.';
  return `오늘 작업 가능 ${quota.remaining_today}/${quota.daily_limit}회 남음`;
}

// private.putduk_apply_principal_penalties()와 같은 강등 순서(전담→선임→크루→라인).
// '라인'이 바닥이라 더 내려가지 않는다('체험'은 1회성 온보딩이라 강등 목적지가 아님).
// 분기 전 항상 normalizeMemberTier로 정규화해서 구 표기·미정의 값을 흡수한다.
export function demoteMemberTierOnce(rawTier) {
  const tier = normalizeMemberTier(rawTier);
  const next = ({
    '전담': '선임',
    '선임': '크루',
    '크루': '라인',
    '라인': '라인'
  })[tier] || '라인';
  return { previousTier: tier, newTier: next };
}
