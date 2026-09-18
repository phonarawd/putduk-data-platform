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

test('FOMO 관련 파일 diff 없음 (PHASE 5 범위)', async () => {
  const { execSync } = await import('node:child_process');
  const diff = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
  const files = diff.split(/\r?\n/).filter(Boolean);
  const fomoTouched = files.filter((file) => /fomo|launch-visual|motion-settings/i.test(file));
  assert.deepEqual(fomoTouched, []);
});
