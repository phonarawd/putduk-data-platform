import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

const migrationPath = '20260920201000_putduk_trial_withdrawal_approval_guard.sql';

test('pre-KYC 체험 수당 1회 예외는 승인 완료·수당 posted 체험만 허용한다', async () => {
  const sql = await readRepo('supabase', 'migrations', migrationPath);

  assert.match(sql, /status = 'approved'/);
  assert.match(sql, /reward_status = 'posted'/);
  assert.match(sql, /coalesce\(r\.is_trial, false\)/);
  assert.match(sql, /n\.tier_band = '체험'/);
  assert.match(sql, /trial_withdraw_used_at is null/);
  assert.match(sql, /체험 업무가 승인된 뒤에만 첫 수당 출금을 사용할 수 있어요/);
});

test('trial_withdraw_used_at 최초 사용은 DB trigger로 우회할 수 없게 막는다', async () => {
  const sql = await readRepo('supabase', 'migrations', migrationPath);

  assert.match(sql, /before update of trial_withdraw_used_at on public\.profiles/);
  assert.match(sql, /old\.trial_withdraw_used_at is null and new\.trial_withdraw_used_at is not null/);
  assert.match(sql, /putduk_guard_trial_withdraw_used_at/);
});

test('체험 첫 수당 안내는 승인 후 3,000원 1회·원화·이후 KYC 계약을 설명한다', async () => {
  const guard = await readRepo('dist', 'assets', 'trial-flow-guard.js');
  const html = await readRepo('dist', 'index.html');

  assert.match(html, /trial-flow-guard\.js\?v=20260920-p1trial1/);
  assert.match(guard, /체험 업무가 승인된 뒤 3,000원 수당은 1회에 한해 본인확인 전에도 원화 계좌로 출금 신청할 수 있어요/);
  assert.match(guard, /이후 출금은 본인확인이 필요해요/);
});

test('체험 제출 결과는 원금 반환으로 오해하지 않도록 수당만 안내한다', async () => {
  const guard = await readRepo('dist', 'assets', 'trial-flow-guard.js');

  assert.match(guard, /지원금 잠금/);
  assert.match(guard, /체험 지원금은 이미 사용됐어요\. 승인되면 수당만 출금가능에 반영돼요/);
  assert.match(guard, /\[data-modal="result-scene"\]/);
  assert.match(guard, /new MutationObserver/);
});

test('체험 흐름 가드는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const guard = await readRepo('dist', 'assets', 'trial-flow-guard.js');
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    assert.doesNotMatch(guard, new RegExp(protectedName));
  }
});
