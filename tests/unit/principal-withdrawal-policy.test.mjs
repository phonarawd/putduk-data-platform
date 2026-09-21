import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

const migrationPath = ['supabase', 'migrations', '20260920193500_putduk_remove_principal_withdraw_penalties.sql'];

test('원금 출금 완료는 등급·혜택·라인 패널티를 적용하지 않는다', async () => {
  const migration = await readRepo(...migrationPath);
  const completeStart = migration.indexOf('create or replace function public.putduk_admin_withdraw_complete');
  const completeBlock = migration.slice(completeStart);

  assert.ok(completeStart >= 0);
  assert.doesNotMatch(completeBlock, /perform\s+private\.putduk_apply_principal_penalties/i);
  assert.doesNotMatch(completeBlock, /(?:set|,)\s*member_tier\s*=/i);
  assert.doesNotMatch(completeBlock, /priority_pick\s*=/i);
  assert.doesNotMatch(completeBlock, /dedicated_queue\s*=/i);
  assert.doesNotMatch(completeBlock, /weekly_volume_boost\s*=/i);
  assert.doesNotMatch(completeBlock, /high_value_notice\s*=/i);
  assert.doesNotMatch(completeBlock, /line_open\s*=/i);
  assert.match(completeBlock, /demotion_applied\s*=\s*false/i);
  assert.match(completeBlock, /line_closed\s*=\s*false/i);
  assert.match(completeBlock, /principal_withdraw_count\s*=\s*coalesce\(principal_withdraw_count, 0\) \+ 1/i);
});

test('레거시 패널티 함수는 회원 상태를 바꾸지 않는 호환 함수다', async () => {
  const migration = await readRepo(...migrationPath);
  const helperStart = migration.indexOf('create or replace function private.putduk_apply_principal_penalties');
  const completeStart = migration.indexOf('create or replace function public.putduk_admin_withdraw_complete');
  const helperBlock = migration.slice(helperStart, completeStart);

  assert.ok(helperStart >= 0);
  assert.doesNotMatch(helperBlock, /update\s+public\.profiles/i);
  assert.match(helperBlock, /'new_tier', v_tier_label/);
  assert.match(helperBlock, /'line_closed', false/);
  assert.match(helperBlock, /'penalty_applied', false/);
});

test('회원 화면은 잘못된 원금 출금 강등 토스트를 통합 정책 가드에서 제거한다', async () => {
  const indexHtml = await readRepo('dist', 'index.html');
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');

  assert.match(indexHtml, /app\.js\?v=20260922-fomo1[\s\S]*toast-policy-guard\.js\?v=20260920-toast4/);
  assert.match(guard, /등급과 라인이 내려가는 출금/);
  assert.match(guard, /MutationObserver/);
  assert.match(guard, /node\.remove\(\)/);
  assert.match(guard, /document\.getElementById\('toastStack'\)/);
});
