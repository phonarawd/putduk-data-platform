import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('출금 PIN 검증은 실패 횟수를 남긴 뒤 예외 없이 결과를 반환한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920070000_putduk_money_ops_pin_idempotency.sql');
  const verifyBlock = migration.slice(
    migration.indexOf('create or replace function public.putduk_member_verify_withdrawal_pin'),
    migration.indexOf('create or replace function public.putduk_member_set_withdrawal_pin')
  );
  const withdrawBlock = migration.slice(
    migration.indexOf('create or replace function public.putduk_member_withdraw_request'),
    migration.indexOf('drop function if exists public.putduk_admin_adjust_balance')
  );

  assert.match(verifyBlock, /failed_attempts = v_attempts/);
  assert.match(verifyBlock, /interval '15 minutes'/);
  assert.match(verifyBlock, /'valid', false/);
  assert.match(verifyBlock, /'locked', v_locked/);
  assert.doesNotMatch(verifyBlock, /raise exception[\s\S]{0,80}출금 비밀번호가 올바르지 않습니다/);

  assert.match(withdrawBlock, /실패 횟수는 verify RPC가 이미 커밋한다/);
  assert.match(withdrawBlock, /raise exception using errcode = '42501', message = '출금 비밀번호가 올바르지 않습니다\.'/);
  assert.doesNotMatch(withdrawBlock, /failed_attempts = failed_attempts \+ 1[\s\S]{0,180}raise exception/);
});

test('출금 PIN 변경은 활동 회원과 현재 PIN을 요구한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920070000_putduk_money_ops_pin_idempotency.sql');
  const setBlock = migration.slice(
    migration.indexOf('create or replace function public.putduk_member_set_withdrawal_pin'),
    migration.indexOf('create or replace function public.putduk_member_withdraw_request')
  );
  assert.match(setBlock, /p\.status = 'active'/);
  assert.match(setBlock, /p_current_pin/);
  assert.match(setBlock, /현재 출금 비밀번호를 확인해 주세요/);
  assert.match(setBlock, /notification_type\)[\s\S]*'security'/);
});

test('관리자 잔액조정은 operation_id와 audit를 한 트랜잭션에서 처리한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920070000_putduk_money_ops_pin_idempotency.sql');
  const edge = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const memberFinance = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');

  assert.match(migration, /create table if not exists private\.admin_money_operations/);
  assert.match(migration, /'admin-adjust:' \|\| v_operation_id::text/);
  assert.match(migration, /putduk_admin_append_audit/);
  assert.match(migration, /'replayed', true/);
  assert.doesNotMatch(migration, /admin-adjust:' \|\| v_direction \|\| ':' \|\| v_bucket \|\| ':' \|\| gen_random_uuid/);

  assert.match(edge, /p_operation_id: operationId/);
  assert.match(edge, /assertUuid\(payload\.operation_id, "작업 번호"\)/);
  const adjustBlock = edge.slice(edge.indexOf('export async function adjustMemberBalance'), edge.indexOf('function normalizeKycStatus'));
  assert.doesNotMatch(adjustBlock, /appendAudit\(/);

  assert.match(memberFinance, /putduk_member_verify_withdrawal_pin/);
  assert.match(memberFinance, /throwIfPinRejected/);
  assert.match(memberFinance, /p_current_pin/);
});

test('Production에서는 dev_seed가 꺼져 있다', async () => {
  const edge = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(edge, /export function isDevSeedAllowed/);
  assert.match(edge, /PUTDUK_ENV/);
  assert.match(edge, /mode !== "development" && mode !== "staging"/);
  assert.match(edge, /return false/);
});

test('관리자 잔액조정 UI는 같은 확인 창에서 operation_id를 재사용한다', async () => {
  const adminIndex = await readRepo('dist', 'admin', 'index.html');
  const safety = await readRepo('dist', 'admin', 'balance-adjust-safety.js');
  const clickSafety = await readRepo('dist', 'admin', 'withdrawal-safety.js');
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(adminIndex, /balance-adjust-safety\.js\?v=20260920-p0money1/);
  assert.match(adminIndex, /withdrawal-safety\.js\?v=20260920-p0money1/);
  assert.match(safety, /dataset\.operationId/);
  assert.match(safety, /operation_id: form\.dataset\.operationId/);
  assert.match(safety, /처리 결과 확인 중/);
  assert.match(clickSafety, /dataset\.operationId/);
  assert.match(clickSafety, /operation_id: form\.dataset\.operationId/);
  assert.match(appJs, /operation_id: form\?\.dataset\?\.operationId/);
});
