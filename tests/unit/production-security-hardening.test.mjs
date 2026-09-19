import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('배정 전용 업무 RLS는 일반 공개와 분리되고 재귀 없이 배정을 확인한다', async () => {
  const [unify, recursionFix] = await Promise.all([
    readRepo('supabase', 'migrations', '20260920054000_putduk_assignment_rls_unify.sql'),
    readRepo('supabase', 'migrations', '20260920054500_putduk_assignment_rls_recursion_fix.sql')
  ]);

  assert.match(unify, /drop policy if exists nodes_select_assigned/i);
  assert.match(unify, /coalesce\(requires_assign, false\) = false/i);
  assert.match(unify, /drop policy if exists brands_select_assigned/i);

  assert.match(recursionFix, /private\.putduk_has_active_assignment/i);
  assert.match(recursionFix, /security definer/i);
  assert.match(recursionFix, /set row_security = off/i);
  assert.match(recursionFix, /grant execute on function private\.putduk_has_active_assignment[\s\S]*to authenticated, service_role/i);
  assert.match(recursionFix, /or private\.putduk_has_active_assignment\(/i);
});

test('회원 지급정보는 고아 평문을 제거하고 DB CHECK로 enc.v1 암호문만 허용한다', async () => {
  const cleanup = await readRepo(
    'supabase',
    'migrations',
    '20260920055000_putduk_member_payout_ciphertext_cleanup.sql'
  );

  assert.match(cleanup, /출금에 연결된 레거시 평문 지급정보가 있어 자동 정리를 중단합니다/i);
  assert.match(cleanup, /not exists \([\s\S]*withdrawal_requests/i);
  assert.match(cleanup, /delete from private\.member_payout_destinations/i);
  assert.match(cleanup, /member_payout_destinations_account_number_ciphertext_check/i);
  assert.match(cleanup, /member_payout_destinations_account_holder_ciphertext_check/i);
  assert.match(cleanup, /member_payout_destinations_usdt_address_ciphertext_check/i);
  assert.match(cleanup, /account_number is null or account_number like 'enc\.v1\.%'/i);
  assert.match(cleanup, /account_holder is null or account_holder like 'enc\.v1\.%'/i);
  assert.match(cleanup, /usdt_address is null or usdt_address like 'enc\.v1\.%'/i);
});
