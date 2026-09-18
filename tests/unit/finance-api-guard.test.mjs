import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';
import {
  FINANCE_API_CLOSED,
  FINANCE_APPLICATION_ACTIONS,
  financeActionGuard,
  isFinanceApiOpen,
  isOpsTrialWithdraw,
  OPS_TRIAL_WITHDRAW_MAX
} from '../../src/wallet/finance-api-guard.mjs';

test('금융 API 전체 오픈(자동 정산)은 환경값이 true일 때만이고 기본은 닫힌다', () => {
  assert.equal(isFinanceApiOpen(undefined), false);
  assert.equal(isFinanceApiOpen(''), false);
  assert.equal(isFinanceApiOpen('false'), false);
  assert.equal(isFinanceApiOpen('true'), true);
  assert.equal(OPS_TRIAL_WITHDRAW_MAX, 3000);
  assert.equal(isOpsTrialWithdraw({ amount: 3000, currency: 'KRW' }), true);
  assert.equal(isOpsTrialWithdraw({ amount: 3001, currency: 'KRW' }), false);
  assert.equal(isOpsTrialWithdraw({ amount: 3000, kind: 'principal' }), false);
});

test('플래그가 꺼져도 입금·출금 신청과 PIN·지갑·KYC는 연다', () => {
  const closed = { open: false };
  assert.equal(financeActionGuard({ ...closed, action: 'deposit_info_challenge' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'deposit_info_reveal' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'wallet' }).ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'submit_kyc' }).ok, true);
  const deposit = financeActionGuard({ ...closed, action: 'submit_deposit', amount: 10000 });
  assert.equal(deposit.ok, true);
  const payout = financeActionGuard({ ...closed, action: 'submit_withdrawal', amount: 8000, currency: 'KRW' });
  assert.equal(payout.ok, true);
  const trial = financeActionGuard({ ...closed, action: 'withdraw_request', amount: 3000, currency: 'KRW' });
  assert.equal(trial.ok, true);
  assert.equal(financeActionGuard({ ...closed, action: 'daily_task_quota' }).ok, true);
  assert.ok(FINANCE_APPLICATION_ACTIONS.includes('submit_deposit'));
  assert.equal(FINANCE_API_CLOSED, 'FINANCE_API_CLOSED');
});

test('Edge 회원 금융은 화면 플래그로 자동 정산을 우회하지 않고 신청 게이트를 쓴다', async () => {
  const source = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const guard = await readRepo('supabase', 'functions', '_shared', 'finance-api-guard.ts');
  assert.match(source, /PUTDUK_ENABLE_FINANCE_API/);
  assert.match(source, /financeActionGuard/);
  assert.match(guard, /FINANCE_API_CLOSED/);
  assert.match(guard, /submit_deposit/);
  assert.match(guard, /신청만으로 잔액을 빼지 않는다/);
});
