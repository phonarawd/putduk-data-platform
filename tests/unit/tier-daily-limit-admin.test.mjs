import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo, readLaunchFiles } from '../helpers/repo.mjs';

test('관리자는 서버에서 등급 한도를 조회하고 라인·크루·선임·전담을 저장한다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminJs, /등급별 하루 업무 한도/);
  assert.match(adminJs, /list_tier_daily_limits/);
  assert.match(adminJs, /set_tier_daily_limit/);
  assert.match(adminJs, /data-action="save-tier-daily-limits"/);
  assert.match(adminJs, /id="tierLimit-\$\{esc\(row\.tier\)\}"/);
  assert.match(adminJs, /id="tierUnlimited-\$\{esc\(row\.tier\)\}"/);
  assert.match(adminJs, /BADGE_TIERS/);
  assert.match(adminJs, /한도 저장/);
  assert.match(adminOps, /putduk_admin_list_tier_daily_limits/);
  assert.match(adminOps, /putduk_admin_set_tier_daily_limit/);
  assert.match(adminOps, /appendAudit\(admin, userId, "등급 하루 한도 변경"/);
});

test('전담 무제한은 체크박스이고 999를 무제한 의미로 쓰지 않는다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminJs, /type="checkbox"/);
  assert.match(adminJs, />무제한</);
  assert.doesNotMatch(adminJs, /daily_limit:\s*999/);
  assert.doesNotMatch(adminJs, /무제한.*=\s*999/);
  assert.match(adminOps, /isUnlimitedFlag/);
  assert.match(adminOps, /parseTierDailyLimit/);
  assert.doesNotMatch(adminOps, /9999/);
});

test('잘못된 숫자는 저장 전에 막고, 일반 회원은 RPC를 직접 호출하지 못한다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const migration = await readRepo('supabase', 'migrations', '20260918110000_putduk_member_tier_daily_limit.sql');
  const overrideSql = await readRepo('supabase', 'migrations', '20260918140000_putduk_tier_limit_admin_quota_override.sql');
  assert.match(adminJs, /횟수는 1 이상 정수로 적어 주세요/);
  assert.match(adminOps, /하루 한도는 0 이상 숫자여야 해요/);
  assert.match(adminOps, /하루 한도는 정수로 적어 주세요/);
  assert.match(migration, /grant execute on function public\.putduk_admin_set_tier_daily_limit/);
  assert.match(migration, /revoke all on function public\.putduk_admin_set_tier_daily_limit/);
  assert.match(migration, /to service_role;/);
  assert.match(migration, /perform private\.putduk_assert_admin\(p_admin_id, array\['super_admin', 'content'\]\)/);
  assert.match(overrideSql, /revoke all on function public\.putduk_admin_set_member_task_quota/);
  assert.match(overrideSql, /grant execute on function public\.putduk_admin_set_member_task_quota/);
  assert.match(overrideSql, /to service_role;/);
});

test('저장 후 최신 값을 다시 조회하고 회원 quota 응답을 그대로 쓴다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const { appJs } = await readLaunchFiles();
  assert.match(adminOps, /const latest = await listTierDailyLimits/);
  assert.match(adminOps, /return \{ limit: data, \.\.\.latest \}/);
  assert.match(adminJs, /latest\?\.limits/);
  assert.match(appJs, /memberFinanceRequest\('daily_task_quota'\)/);
  assert.match(appJs, /state\.dailyTaskQuota = quotaResult\.quota/);
  assert.match(adminOps, /putduk_member_daily_task_quota/);
});

test('회원 상세는 등급·기본 한도·오늘 사용·남은 횟수·예외·추가 횟수를 보여 준다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(adminJs, /등급 기본 한도/);
  assert.match(adminJs, /오늘 사용/);
  assert.match(adminJs, /오늘 남은 횟수/);
  assert.match(adminJs, /회원별 예외/);
  assert.match(adminJs, /추가 횟수/);
  assert.match(adminJs, /memberTaskQuotaForm/);
  assert.match(adminJs, /set_member_task_quota/);
  assert.match(adminJs, /use_tier_default/);
});
