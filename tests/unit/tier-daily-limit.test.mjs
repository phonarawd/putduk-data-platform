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
  dailyQuotaLabel,
  demoteMemberTierOnce,
  effectiveDailyCap
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

test('회원 예외와 추가 횟수는 등급 한도 위에 더해지고 무제한에는 더하지 않는다', () => {
  const line = effectiveDailyCap({ tierLimit: 3, override: null, extra: 2 });
  assert.equal(line.unlimited, false);
  assert.equal(line.cap, 5);
  const override = effectiveDailyCap({ tierLimit: 3, override: 1, extra: 2 });
  assert.equal(override.cap, 3);
  const unlimited = effectiveDailyCap({ tierLimit: 3, override: 0, extra: 9 });
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.cap, 0);
});

test('하루 한도 요약은 남은 횟수를 0 미만으로 내리지 않고, 0=무제한을 표시한다', () => {
  const now = new Date('2026-09-18T05:00:00.000Z');
  const line3 = dailyQuotaSummary({ tier: '라인', limit: 3, used: 1, now });
  assert.equal(line3.daily_limit, 3);
  assert.equal(line3.used_today, 1);
  assert.equal(line3.remaining_today, 2);
  assert.equal(line3.unlimited, false);
  assert.equal(dailyQuotaLabel(line3), '오늘 남은 횟수 2회');

  const usedUp = dailyQuotaSummary({ tier: '크루', limit: 5, used: 9, now });
  assert.equal(usedUp.remaining_today, 0);

  const unlimited = dailyQuotaSummary({ tier: '전담', limit: 0, used: 30, now });
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.remaining_today, null);
  assert.equal(dailyQuotaLabel(unlimited), '오늘 남은 횟수 무제한');
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

test('원금 출금 강등은 전담→선임→크루→라인 순서이고 라인이 바닥이다', () => {
  assert.deepEqual(demoteMemberTierOnce('전담'), { previousTier: '전담', newTier: '선임' });
  assert.deepEqual(demoteMemberTierOnce('선임'), { previousTier: '선임', newTier: '크루' });
  assert.deepEqual(demoteMemberTierOnce('크루'), { previousTier: '크루', newTier: '라인' });
  assert.deepEqual(demoteMemberTierOnce('라인'), { previousTier: '라인', newTier: '라인' });

  // 구 표기가 저장돼 있어도 먼저 정규화한 뒤 강등한다.
  assert.deepEqual(demoteMemberTierOnce('글로벌 디렉터'), { previousTier: '전담', newTier: '선임' });
  assert.deepEqual(demoteMemberTierOnce('우수 파트너'), { previousTier: '선임', newTier: '크루' });
  assert.deepEqual(demoteMemberTierOnce('인증 파트너'), { previousTier: '크루', newTier: '라인' });
  assert.deepEqual(demoteMemberTierOnce('일반 파트너'), { previousTier: '라인', newTier: '라인' });

  // 정의된 적 없는 '주임' 같은 값이나 빈 값이 들어와도 라인으로 안전하게 처리된다.
  assert.deepEqual(demoteMemberTierOnce('주임'), { previousTier: '라인', newTier: '라인' });
  assert.deepEqual(demoteMemberTierOnce(''), { previousTier: '라인', newTier: '라인' });
});

test('강등 마이그레이션은 기존 파일을 고치지 않고 정규화 함수로 분기한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260918130000_putduk_member_tier_normalize_penalties.sql');
  assert.match(migration, /create or replace function private\.putduk_apply_principal_penalties/);
  assert.match(migration, /v_tier_label := private\.putduk_normalize_member_tier\(v_tier\)/);
  assert.match(migration, /case v_tier_label/);
  assert.match(migration, /when '전담' then '선임'/);
  assert.match(migration, /when '선임' then '크루'/);
  assert.match(migration, /when '크루' then '라인'/);
  // '주임' 분기(when '주임' then ...)는 더 이상 활성 코드에 없어야 한다.
  assert.doesNotMatch(migration, /when '주임'/);
  // 나머지 로직(자리·플래그 초기화)은 그대로 유지됐는지 확인.
  assert.match(migration, /priority_pick = false/);
  assert.match(migration, /principal_withdraw_count = principal_withdraw_count \+ 1/);

  // 기존(문제가 있던) 마이그레이션 파일 자체는 이번 수정에서 건드리지 않는다.
  const original = await readRepo('supabase', 'migrations', '20260917210000_putduk_three_bucket_ledger.sql');
  assert.match(original, /when '주임' then '라인'/);
});

test('관리자 등급 변경 저장은 서버에서 배지 라벨로 정규화한다', async () => {
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminOps, /function normalizeMemberTierLabel/);
  assert.match(adminOps, /const tier = normalizeMemberTierLabel\(textValue\(payload\.member_tier/);
  assert.doesNotMatch(adminOps, /주임/);

  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.doesNotMatch(adminJs, /주임/);
  const { appJs } = await readLaunchFiles();
  assert.doesNotMatch(appJs, /주임/);
});

test('회원 대시보드는 오늘 남은 횟수를 실제 서버 값으로 보여준다', async () => {
  const { appJs } = await readLaunchFiles();
  const financeSource = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const guardSource = await readRepo('supabase', 'functions', '_shared', 'finance-api-guard.ts');
  assert.match(appJs, /오늘 남은 횟수/);
  assert.match(appJs, /dailyTaskQuota/);
  assert.match(appJs, /memberFinanceRequest\('daily_task_quota'\)/);
  assert.doesNotMatch(appJs, />오늘 남은 횟수 \d+회</);
  assert.match(financeSource, /putduk_member_daily_task_quota/);
  assert.match(financeSource, /action === "daily_task_quota"/);
  assert.match(guardSource, /"daily_task_quota"/);
});

test('라인 찾기 목록·업무 카드·출근 확인 화면이 대시보드와 같은 하루 한도 값을 재사용한다', async () => {
  const { appJs } = await readLaunchFiles();
  // 하나의 계산 함수(dailyQuotaParts/dailyQuotaSummaryText)를 두고 화면마다 재사용해야
  // 숫자가 어긋나지 않는다. 각 화면이 state.dailyTaskQuota를 직접 다시 계산하지 않는지 확인.
  assert.match(appJs, /function dailyQuotaParts\(\)/);
  assert.match(appJs, /function dailyQuotaSummaryText\(\)/);

  const nodesPageStart = appJs.indexOf('function renderNodesPage');
  const nodesPageBody = appJs.slice(nodesPageStart, nodesPageStart + 1200);
  assert.match(nodesPageBody, /dailyQuotaSummaryText\(\)/);

  const nodeCardBody = appJs.slice(appJs.indexOf('function renderNodeCard'), appJs.indexOf('function renderNodeCard') + 1800);
  assert.match(nodeCardBody, /출근하기/);
  assert.equal(nodeCardBody.includes('오늘 소진'), false);
  assert.equal(nodeCardBody.includes('dailyQuotaParts()'), false);

  const startConfirmBody = appJs.slice(appJs.indexOf('function renderStartConfirm'), appJs.indexOf('function renderStartConfirm') + 1800);
  assert.match(startConfirmBody, /dailyQuotaSummaryText\(\)/);

  const dashboardStart = appJs.indexOf('function renderMemberDashboard');
  const dashboardBody = appJs.slice(dashboardStart, dashboardStart + 2500);
  assert.match(dashboardBody, /dailyQuotaParts\(\)/);
});

test('관리자 회원 상세는 같은 putduk_member_daily_task_quota RPC로 대상 회원의 오늘 사용/한도를 조회만 한다', async () => {
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const { appJs } = await readLaunchFiles();

  const getMemberBody = adminOps.slice(adminOps.indexOf('export async function getMember('), adminOps.indexOf('export async function listMemberActivity'));
  assert.match(getMemberBody, /admin\.rpc\("putduk_member_daily_task_quota", \{ p_user_id: memberId \}\)/);
  assert.match(getMemberBody, /daily_task_quota: quotaResult\.data \|\| null/);

  assert.match(adminJs, /function memberQuotaText\(quota\)/);
  assert.match(adminJs, /오늘 작업\(사용\/한도\)/);
  assert.match(adminJs, /memberQuotaText\(quota\)/);

  assert.match(adminJs, /data-action="save-tier-daily-limits"/);
  assert.match(adminJs, /list_tier_daily_limits/);
  assert.match(adminJs, /set_tier_daily_limit/);

  // app.js의 flattenMemberDetail이 daily_task_quota를 흘려보내야 admin.js가 값을 받는다.
  assert.match(appJs, /daily_task_quota: payload\.daily_task_quota \|\| null/);
});


test('회원 화면의 오늘 남은 횟수 표시가 단일 표시 계약을 사용하고 조회 완료 후 즉시 갱신된다', async () => {
  const { appJs } = await readLaunchFiles();
  const helperStart = appJs.indexOf('function dailyQuotaDisplay()');
  const helperEnd = appJs.indexOf('function paintDailyQuota()', helperStart);
  const helper = appJs.slice(helperStart, helperEnd);
  assert.match(helper, /오늘 남은 횟수/);

  const dashboardStart = appJs.indexOf('function renderMemberDashboard');
  const dashboardBody = appJs.slice(dashboardStart, appJs.indexOf('function renderNodeCard', dashboardStart));
  assert.match(dashboardBody, /data-daily-quota-label/);
  assert.match(dashboardBody, /data-daily-quota-value/);

  const nodesStart = appJs.indexOf('function renderNodesPage');
  const nodesBody = appJs.slice(nodesStart, appJs.indexOf('function renderHistoryPage', nodesStart));
  assert.match(nodesBody, /data-daily-quota-summary/);
  assert.match(nodesBody, /dailyQuotaSummaryText\(\)/);

  const startStart = appJs.indexOf('function renderStartConfirm');
  const startBody = appJs.slice(startStart, appJs.indexOf('function renderResultOverlay', startStart));
  assert.match(startBody, /data-daily-quota-summary/);
  assert.match(startBody, /dailyQuotaSummaryText\(\)/);

  assert.match(appJs, /async function hydrateDailyTaskQuota\(\{ retry = 0 \} = \{\}\)/);
  assert.match(appJs, /state\.dailyTaskQuotaError/);
  assert.match(appJs, /Promise\.race\(\[request, timeout\]\)/);
  assert.match(appJs, /if \(retry < 2\)/);
  assert.match(appJs, /void hydrateDailyTaskQuota\(\);/);
  assert.doesNotMatch(appJs, /state\.dailyTaskQuota = quotaResult\.quota \|\| null;/);
  assert.match(appJs, /supabaseClient\.rpc\('putduk_member_daily_task_quota', \{ p_user_id: userId \}\)/);

  const quotaMigration = await readRepo('supabase', 'migrations', '20260923223500_putduk_member_daily_quota_client_rpc.sql');
  assert.match(quotaMigration, /grant execute on function public\.putduk_member_daily_task_quota\(uuid\) to authenticated/);

  const index = await readRepo('dist', 'index.html');
  const headers = await readRepo('dist', '_headers');
  assert.match(index, /app-ia13\.js\?v=20260924-phase10e/);
  assert.match(headers, /\/assets\/app\.js[\\s\\S]*! Cache-Control[\\s\\S]*Cache-Control: public, max-age=0, must-revalidate/);
});
