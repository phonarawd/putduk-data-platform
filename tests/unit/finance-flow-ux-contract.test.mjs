import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('KRW/USDT 입금 통화는 선택한 목적지 흐름에 고정한다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');

  assert.match(guard, /select\.name = ''/);
  assert.match(guard, /hidden\.name = 'currency'/);
  assert.match(guard, /putdukDepositCurrency/);
  assert.match(guard, /input\[name="destination_id"\]/);
  assert.match(guard, /현재 사용할 수 있는 입금 안내 목적지를 확인할 수 없어요/);
});

test('고액 출금은 같은 금액 재입력을 요구한다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');

  assert.match(guard, /HIGH_VALUE_MIN = 3000000/);
  assert.match(guard, /data-putduk-high-repeat/);
  assert.match(guard, /repeatedAmount === amount/);
  assert.match(guard, /고액 출금 재확인/);
});

test('출금 방식에 따라 은행과 USDT 입력 필드를 분리하고 요청 중 잠근다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');

  assert.match(guard, /setFieldVisible\(bank, !isUsdt, true\)/);
  assert.match(guard, /setFieldVisible\(network, isUsdt, true\)/);
  assert.match(guard, /form\.dataset\.putdukWithdrawBusy/);
  assert.match(guard, /출금 요청 중…/);
  assert.match(guard, /set_withdrawal_pin/);
  assert.match(guard, /withdraw_request/);
});

test('PIN 설정 실패 시 출금 폼 busy를 해제해 영구 잠김을 막는다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');

  assert.match(guard, /setWithdrawBusy\(form, false\)/);
  assert.match(guard, /출금 비밀번호를 저장하지 못했어요\. 다시 확인해 주세요\./);
});

test('입금·출금·KYC는 운영자 수동 처리 상태를 inline으로 안내한다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');

  assert.match(guard, /운영자가 확인한 뒤 수동으로 지급 처리합니다/);
  assert.match(guard, /운영자 확인을 기다려 주세요/);
  assert.match(guard, /운영자 검수를 기다려 주세요/);
  assert.match(guard, /운영자가 확인 후 지급 처리합니다/);
});

test('DB trigger는 destination 필수와 KRW-bank / USDT-usdt 일치를 강제한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260920202500_putduk_deposit_destination_contract.sql');

  assert.match(migration, /new\.destination_id is null/);
  assert.match(migration, /new\.currency = 'KRW' and v_type <> 'bank'/);
  assert.match(migration, /new\.currency = 'USDT' and v_type <> 'usdt'/);
  assert.match(migration, /before insert or update of currency, destination_id/);
});

test('member index는 finance flow UX guard를 phase4 finance wiring 뒤에 연결한다', async () => {
  const html = await readRepo('dist', 'index.html');
  const phase4Index = html.indexOf('phase4-finance-wiring.js?v=20260925-console1');
  const guardIndex = html.indexOf('finance-flow-ux.js?v=20260924-phase1w1');

  assert.ok(phase4Index >= 0);
  assert.ok(guardIndex > phase4Index);
});

test('finance UX guard는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const guard = await readRepo('dist', 'assets', 'finance-flow-ux.js');
  for (const name of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    assert.doesNotMatch(guard, new RegExp(name));
  }
});
