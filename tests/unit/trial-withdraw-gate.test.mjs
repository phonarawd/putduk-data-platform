import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAL_WITHDRAW_MAX,
  TRIAL_WITHDRAW_KYC_REQUIRED,
  TRIAL_WITHDRAW_ALREADY_USED,
  trialWithdrawGate
} from '../../src/wallet/trial-withdraw-gate.mjs';
import { readRepo } from '../helpers/repo.mjs';

const TRIAL_CONSUMED = '2026-09-18T01:00:00.000Z';

test('(a) 체험 소진 + KYC 미승인 + 3,000원 + 최초 신청 → 허용', () => {
  const result = trialWithdrawGate({
    kycApproved: false,
    trialConsumedAt: TRIAL_CONSUMED,
    trialWithdrawUsedAt: null,
    amount: 3000,
    currency: 'KRW',
    includePrincipal: false
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'trial_exception');
  assert.equal(TRIAL_WITHDRAW_MAX, 3000);
});

test('(b) 같은 조건이지만 이미 한 번 썼으면(trial_withdraw_used_at 존재) → 거부', () => {
  const result = trialWithdrawGate({
    kycApproved: false,
    trialConsumedAt: TRIAL_CONSUMED,
    trialWithdrawUsedAt: '2026-09-18T02:00:00.000Z',
    amount: 3000,
    currency: 'KRW',
    includePrincipal: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, TRIAL_WITHDRAW_ALREADY_USED);
  assert.match(result.message, /한 번만 할 수 있어요/);
});

test('(c) 체험 소진 + KYC 미승인이어도 3,001원 이상이면 → 거부', () => {
  const result = trialWithdrawGate({
    kycApproved: false,
    trialConsumedAt: TRIAL_CONSUMED,
    trialWithdrawUsedAt: null,
    amount: 3001,
    currency: 'KRW',
    includePrincipal: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, TRIAL_WITHDRAW_KYC_REQUIRED);

  // 정확히 3,000원은 여전히 허용(경계값), 3,000.01원은 거부.
  assert.equal(trialWithdrawGate({
    kycApproved: false, trialConsumedAt: TRIAL_CONSUMED, amount: 3000, currency: 'KRW'
  }).ok, true);
  assert.equal(trialWithdrawGate({
    kycApproved: false, trialConsumedAt: TRIAL_CONSUMED, amount: 3000.01, currency: 'KRW'
  }).ok, false);
});

test('(d) 체험을 아직 안 쓴(trial_consumed_at 없음) 회원은 KYC 미승인이면 → 거부', () => {
  const result = trialWithdrawGate({
    kycApproved: false,
    trialConsumedAt: null,
    trialWithdrawUsedAt: null,
    amount: 3000,
    currency: 'KRW',
    includePrincipal: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, TRIAL_WITHDRAW_KYC_REQUIRED);
});

test('(e) KYC 승인된 회원은 금액·원금포함 여부와 상관없이 항상 허용', () => {
  assert.equal(trialWithdrawGate({ kycApproved: true, amount: 3000 }).ok, true);
  assert.equal(trialWithdrawGate({ kycApproved: true, amount: 5_000_000, includePrincipal: true, currency: 'USDT' }).ok, true);
  assert.equal(trialWithdrawGate({ kycApproved: true, trialConsumedAt: null, trialWithdrawUsedAt: '2020-01-01' }).ok, true);
});

test('원금 포함 요청이나 KRW가 아닌 통화는 체험 예외 대상이 아니다', () => {
  assert.equal(trialWithdrawGate({
    kycApproved: false, trialConsumedAt: TRIAL_CONSUMED, amount: 3000, currency: 'KRW', includePrincipal: true
  }).ok, false);
  assert.equal(trialWithdrawGate({
    kycApproved: false, trialConsumedAt: TRIAL_CONSUMED, amount: 3000, currency: 'USDT'
  }).ok, false);
});

test('마이그레이션은 기존 함수 파일을 고치지 않고 새 파일로 KYC 예외를 복원한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260918120000_putduk_trial_withdraw_kyc_restore.sql');
  assert.match(migration, /alter table public\.profiles\s*\n\s*add column if not exists trial_withdraw_used_at timestamptz/);
  assert.match(migration, /create or replace function public\.putduk_member_withdraw_request/);
  assert.match(migration, /round\(p_amount, 2\) > 3000/);
  assert.match(migration, /체험 수당 출금은 한 번만 할 수 있어요\./);
  assert.match(migration, /trial_withdraw_used_at is null/);
  // 세 칸 원장 구조(버킷 이름)는 그대로 유지해야 한다.
  assert.match(migration, /bucket = 'work_balance'/);
  assert.match(migration, /bucket = 'available'/);

  // 기존 마이그레이션 3개는 이번 수정에서 건드리지 않는다(새 파일만 추가).
  const original1 = await readRepo('supabase', 'migrations', '20260917115028_trial_ops_withdraw_and_activate_confirmed.sql');
  const original2 = await readRepo('supabase', 'migrations', '20260917120956_trial_ops_withdraw.sql');
  const original3 = await readRepo('supabase', 'migrations', '20260917210000_putduk_three_bucket_ledger.sql');
  assert.match(original1, /putduk_withdraw_identity_ok/);
  assert.match(original2, /trial_consumed_at is not null/);
  assert.match(original3, /kyc_status = 'approved'/);
});
