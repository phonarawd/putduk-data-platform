import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('최신 출금 함수는 PIN 실패를 예외로 롤백하지 않는다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920070000_putduk_money_ops_pin_idempotency.sql');
  assert.match(migration, /putduk_member_verify_withdrawal_pin/);
  assert.doesNotMatch(migration, /failed_attempts = failed_attempts \+ 1[\s\S]{0,220}raise exception using errcode = '42501', message = '출금 비밀번호가 올바르지 않습니다/);
});

test('체험 3,000원 KYC 예외·PIN·open request·hold는 migration에 유지된다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260919120000_putduk_phase5_kyc_payout_security.sql');
  assert.match(migration, /trial_withdraw_used_at/);
  assert.match(migration, /round\(p_amount, 2\) > 3000/);
  assert.match(migration, /체험 수당 출금은 한 번만/);
  assert.match(migration, /failed_attempts \+ 1 >= 5/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /status in \('submitted', 'checking', 'approved'\)/);
  assert.match(migration, /withdrawal_hold/);
  assert.match(migration, /kyc_status = 'approved'/);
});

test('request_upload KYC selfie PDF는 server에서 거절한다', async () => {
  const edge = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  assert.match(edge, /isAllowedKycUploadType/);
  assert.match(edge, /documentKind === "selfie"/);
  assert.match(edge, /셀카는 JPG, PNG, WEBP만/);
});

test('public destination_label·withdrawal payload에 예금주 평문이 없다', async () => {
  const edge = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const submitBlock = edge.slice(edge.indexOf('async function submitWithdrawal'), edge.indexOf('async function submitKyc'));
  assert.doesNotMatch(submitBlock, /destinationLabel\s*=\s*`\$\{String\(bankName[^`]*accountHolderPlain/);
  assert.match(submitBlock, /destinationLabel = String\(bankName/);
  assert.match(submitBlock, /p_account_holder: accountHolderEnc/);
  assert.match(submitBlock, /p_account_number: accountNumberEnc/);
  assert.doesNotMatch(submitBlock, /p_destination_label:[\s\S]*accountHolderPlain/);
});

test('금액 작업 P0 변경은 FOMO 연출 파일을 건드리지 않는다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920070000_putduk_money_ops_pin_idempotency.sql');
  const edge = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const fomoMarkers = ['FOMO_FEED_SLOTS', 'fomoTimer', 'fomoFeedCache', 'fomoNameCooldown'];
  for (const marker of fomoMarkers) {
    assert.equal(migration.includes(marker), false, marker);
    assert.equal(edge.includes(marker), false, marker);
  }
});
