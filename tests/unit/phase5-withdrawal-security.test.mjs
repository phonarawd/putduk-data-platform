import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

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

test('FOMO 관련 diff 없음 (PHASE 5 범위, branch parent 기준)', async () => {
  const { execSync } = await import('node:child_process');
  const parent = '020c0dcd2e01dc3b67ec8cb990898e4af55a8ae5';
  const diff = execSync(`git diff ${parent}..HEAD -- dist/assets/app.js`, { encoding: 'utf8' });
  const changedLines = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    // PHASE 5는 saveState의 민감 state 제외 목록만 바꾼다. 이 줄의 기존 crewPulse 토큰은 FOMO 변경이 아니다.
    .filter((line) => !(line.includes('const {') && line.includes('crewPulse') && line.includes('...rest')));
  const fomoMarkers = ['FOMO_FEED_SLOTS', 'fomoTimer', 'fomoFeedCache', 'fomoNameCooldown', 'crewPulse'];
  for (const marker of fomoMarkers) {
    const touched = changedLines.some((line) => line.includes(marker));
    assert.equal(touched, false, `FOMO marker ${marker} should not change in app.js diff`);
  }
  const names = execSync(`git diff --name-only ${parent}..HEAD`, { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const fomoTouched = names.filter((file) => /fomo|launch-visual|motion-settings/i.test(file));
  assert.deepEqual(fomoTouched, []);
});
