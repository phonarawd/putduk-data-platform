import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';
import {
  FINANCE_API_CLOSED,
  financeActionGuard,
  isFinanceApiOpen,
  isOpsTrialWithdraw,
  OPS_TRIAL_WITHDRAW_MAX
} from '../../src/wallet/finance-api-guard.mjs';

test('금융 API는 환경값이 true일 때만 열리고 기본은 닫힌다', () => {
  assert.equal(isFinanceApiOpen(undefined), false);
  assert.equal(isFinanceApiOpen(''), false);
  assert.equal(isFinanceApiOpen('false'), false);
  assert.equal(isFinanceApiOpen('true'), true);
  assert.equal(OPS_TRIAL_WITHDRAW_MAX, 3000);
  assert.equal(isOpsTrialWithdraw({ amount: 3000, currency: 'KRW' }), true);
  assert.equal(isOpsTrialWithdraw({ amount: 3001, currency: 'KRW' }), false);
  assert.equal(isOpsTrialWithdraw({ amount: 3000, kind: 'principal' }), false);
});

test('플래그가 꺼지면 입금·일반 출금은 서버에서 거절하고 PIN·지갑은 연다', () => {
  const closed = { open: false };
  assert.equal(financeActionGuard({ ...closed, action: 'deposit_info_challenge' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'deposit_info_reveal' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'wallet' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'submit_kyc' }).ok, true);
  const deposit = financeActionGuard({ ...closed, action: 'submit_deposit', amount: 10000 });
  assert.equal(deposit.ok, false);
  assert.equal(deposit.status, 403);
  assert.equal(deposit.code, FINANCE_API_CLOSED);
  const payout = financeActionGuard({ ...closed, action: 'submit_withdrawal', amount: 8000, currency: 'KRW' });
  assert.equal(payout.ok, false);
  assert.equal(payout.code, FINANCE_API_CLOSED);
  const trial = financeActionGuard({ ...closed, action: 'withdraw_request', amount: 3000, currency: 'KRW' });
  assert.equal(trial.ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'daily_task_quota' }).ok, true);
});

test('Edge 회원 금융은 화면 플래그 우회를 서버에서 막는다', async () => {
  const source = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const guard = await readRepo('supabase', 'functions', '_shared', 'finance-api-guard.ts');
  assert.match(source, /PUTDUK_ENABLE_FINANCE_API/);
  assert.match(source, /financeActionGuard/);
  assert.match(guard, /FINANCE_API_CLOSED/);
  assert.match(guard, /출금은 아직 운영 확인 중이에요/);
});
