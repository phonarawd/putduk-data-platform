import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BADGE_TIERS,
  DEFAULT_TIER_DAILY_LIMITS,
  normalizeMemberTier,
  defaultDailyLimitForTier,
  kstDayStart,
  kstDayRange,
  isWithinKstDay,
  dailyQuotaSummary,
  dailyQuotaLabel
} from '../../src/work/tier-daily-limit.mjs';
import { readRepo, readLaunchFiles } from '../helpers/repo.mjs';

test('등급 표기는 구 파트너 명칭과 배지 라벨을 모두 4단계로 정규화한다', () => {
  assert.equal(normalizeMemberTier('일반 파트너'), '라인');
  assert.equal(normalizeMemberTier('인증 파트너'), '크루');
  assert.equal(normalizeMemberTier('우수 파트너'), '선임');
  assert.equal(normalizeMemberTier('글로벌 디렉터'), '전담');
  assert.equal(normalizeMemberTier('라인'), '라인');
  assert.equal(normalizeMemberTier('크루'), '크루');
  assert.equal(normalizeMemberTier('선임'), '선임');
  assert.equal(normalizeMemberTier('전담'), '전담');
  assert.equal(normalizeMemberTier(''), '라인');
  assert.equal(normalizeMemberTier(undefined), '라인');
  assert.equal(normalizeMemberTier('알수없음'), '라인');
  assert.deepEqual(BADGE_TIERS, ['라인', '크루', '선임', '전담']);
});

test('임시 기본 한도는 라인<크루<선임 순으로 커지고 전담은 무제한(0)이다', () => {
  assert.equal(DEFAULT_TIER_DAILY_LIMITS['라인'], 3);
  assert.equal(DEFAULT_TIER_DAILY_LIMITS['크루'], 5);
  assert.equal(DEFAULT_TIER_DAILY_LIMITS['선임'], 10);
  assert.equal(DEFAULT_TIER_DAILY_LIMITS['전담'], 0);
  assert.equal(defaultDailyLimitForTier('일반 파트너'), 3);
  assert.equal(defaultDailyLimitForTier('글로벌 디렉터'), 0);
});

test('KST 자정 경계는 UTC 자정이 아니라 한국 시간 자정을 기준으로 잡는다', () => {
  // 2026-09-18 23:30 KST == 2026-09-18 14:30 UTC. 이 시각의 KST 하루는
  // 2026-09-18 00:00 KST(=2026-09-17 15:00 UTC)부터 다음날 00:00 KST 전까지다.
  const lateNightKst = new Date('2026-09-18T14:30:00.000Z');
  const start = kstDayStart(lateNightKst);
  assert.equal(start.toISOString(), '2026-09-17T15:00:00.000Z');
  const { end } = kstDayRange(lateNightKst);
  assert.equal(end.toISOString(), '2026-09-18T15:00:00.000Z');

  // UTC 자정 직후(오전 9시 KST)에도 같은 KST 날짜여야 한다(UTC 자정 기준이면 틀리게 나옴).
  const justAfterUtcMidnight = new Date('2026-09-18T00:05:00.000Z');
  const start2 = kstDayStart(justAfterUtcMidnight);
  assert.equal(start2.toISOString(), '2026-09-17T15:00:00.000Z');

  assert.equal(isWithinKstDay('2026-09-17T15:00:00.000Z', lateNightKst), true);
  assert.equal(isWithinKstDay('2026-09-17T14:59:59.000Z', lateNightKst), false);
  assert.equal(isWithinKstDay('2026-09-18T14:59:59.999Z', lateNightKst), true);
  assert.equal(isWithinKstDay('2026-09-18T15:00:00.000Z', lateNightKst), false);
});

test('하루 한도 요약은 남은 횟수를 0 미만으로 내리지 않고, 0=무제한을 표시한다', () => {
  const now = new Date('2026-09-18T05:00:00.000Z');
  const line3 = dailyQuotaSummary({ tier: '라인', limit: 3, used: 1, now });
  assert.equal(line3.daily_limit, 3);
  assert.equal(line3.used_today, 1);
  assert.equal(line3.remaining_today, 2);
  assert.equal(line3.unlimited, false);
  assert.equal(dailyQuotaLabel(line3), '오늘 작업 가능 2/3회 남음');

  const usedUp = dailyQuotaSummary({ tier: '크루', limit: 5, used: 9, now });
  assert.equal(usedUp.remaining_today, 0);

  const unlimited = dailyQuotaSummary({ tier: '전담', limit: 0, used: 30, now });
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.remaining_today, null);
  assert.equal(dailyQuotaLabel(unlimited), '오늘 작업 횟수 제한이 없어요.');
});

test('DB 마이그레이션은 등급별 하루 한도 테이블·트리거 보완·조회·운영자 RPC를 갖춘다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260918110000_putduk_member_tier_daily_limit.sql');
  assert.match(migration, /create table if not exists public\.member_tier_daily_limits/);
  assert.match(migration, /private\.putduk_normalize_member_tier/);
  assert.match(migration, /오늘 이용 가능한 업무 횟수를 모두 사용했어요\. 자정에 다시 채워져요\./);
  assert.match(migration, /create or replace function private\.prepare_putduk_task_run/);
  assert.match(migration, /create or replace function public\.putduk_member_daily_task_quota/);
  assert.match(migration, /create or replace function public\.putduk_admin_set_tier_daily_limit/);
  // 기존 동시 진행 1건 제한·노드별 daily_cap 로직은 그대로 남아 있어야 한다(대체 금지).
  assert.match(migration, /진행 중인 업무를 먼저 마무리해 주세요\./);
  assert.match(migration, /오늘 준비된 업무 수량이 모두 소진되었습니다\./);
});

test('회원 대시보드는 오늘 작업 가능 횟수를 실제 서버 값으로 보여준다', async () => {
  const { appJs } = await readLaunchFiles();
  const financeSource = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const guardSource = await readRepo('supabase', 'functions', '_shared', 'finance-api-guard.ts');
  assert.match(appJs, /오늘 작업 가능/);
  assert.match(appJs, /dailyTaskQuota/);
  assert.match(appJs, /memberFinanceRequest\('daily_task_quota'\)/);
  assert.doesNotMatch(appJs, />오늘 작업 가능 \d+\/5회 남음</);
  assert.match(financeSource, /putduk_member_daily_task_quota/);
  assert.match(financeSource, /action === "daily_task_quota"/);
  assert.match(guardSource, /"daily_task_quota"/);
});
