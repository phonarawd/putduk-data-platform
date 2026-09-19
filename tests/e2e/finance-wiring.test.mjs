import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('회원 입금은 private signed upload 후 서버 신청으로 이어진다', async () => {
  const [html, wiring, appJs, perfDeferred] = await Promise.all([
    readFile(repoPath('dist/index.html'), 'utf8'),
    readFile(repoPath('dist/assets/phase4-finance-wiring.js'), 'utf8'),
    readFile(repoPath('dist/assets/app.js'), 'utf8'),
    readFile(repoPath('dist/assets/perf-deferred.js'), 'utf8')
  ]);

  assert.match(html, /phase4-finance-wiring\.js/);
  assert.match(perfDeferred, /phase4-finance-wiring\.js\?v=20260919-p4r2/);
  assert.match(html, /app\.js\?v=20260920-perf3/);
  assert.match(wiring, /request_upload/);
  assert.match(wiring, /purpose:\s*'deposit_proof'/);
  assert.match(wiring, /uploadToSignedUrl/);
  assert.match(wiring, /submit_deposit/);
  assert.match(wiring, /proof_path:\s*path/);
  assert.match(wiring, /depositProofFile/);
  assert.match(wiring, /10 \* 1024 \* 1024/);
  assert.match(wiring, /depositJumpForm/);
  assert.match(wiring, /stopImmediatePropagation/);
  assert.match(wiring, /if \(form\.querySelector\('#depositProofFile'\)\)/);
  assert.doesNotMatch(wiring, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(appJs, /id="depositProofFile"/);
  assert.match(appJs, /memberFinanceRequest\('request_upload'/);
  assert.match(appJs, /proof_path:\s*proofPath/);
  assert.doesNotMatch(appJs, /proof_path:\s*''/);
});
