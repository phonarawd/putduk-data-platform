import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

test('depositForm은 PIN 공개 뒤에 생기고 증빙 파일 칸이 템플릿에 있다', async () => {
  const { appJs } = await readLaunchFiles();
  const formStart = appJs.indexOf('<form id="depositForm">');
  const pinForm = appJs.indexOf('id="depositPinForm"');
  const pinSetForm = appJs.indexOf('id="depositPinSetForm"');
  const revealedGate = appJs.indexOf('const amountForm = isDepositRevealed()');
  assert.ok(formStart > -1);
  assert.ok(pinForm > -1 && pinSetForm > -1);
  assert.ok(revealedGate > -1 && revealedGate < formStart);
  const formSlice = appJs.slice(formStart, formStart + 1800);
  assert.match(formSlice, /id="depositProofFile"/);
  assert.match(formSlice, /name="proof_file"/);
  assert.match(formSlice, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(formSlice, /min="1000"/);
});

test('네이티브 입금 신청은 실제 proof_path만 보내고 빈 경로는 없다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /memberFinanceRequest\('request_upload'/);
  assert.match(appJs, /purpose:\s*'deposit_proof'/);
  assert.match(appJs, /uploadToSignedUrl/);
  assert.match(appJs, /proof_path:\s*proofPath/);
  assert.match(appJs, /assertDepositProofFile/);
  assert.match(appJs, /state\.depositJump = \{ \.\.\.values, file, proof_file: file \}/);
  assert.doesNotMatch(appJs, /proof_path:\s*''/);
  assert.doesNotMatch(appJs, /proof_path:\s*""/);
});

test('PHASE 4 오버레이는 기존 증빙 칸을 중복 넣지 않고 고액은 점프 폼만 가로챈다', async () => {
  const wiring = await readRepo('dist', 'assets', 'phase4-finance-wiring.js');
  assert.match(wiring, /new MutationObserver\(scan\)/);
  assert.match(wiring, /augmentDepositForm\(document\.getElementById\('depositForm'\)\)/);
  assert.match(wiring, /if \(form\.querySelector\('#depositProofFile'\)\)/);
  assert.match(wiring, /form\.dataset\.phase4FinanceWired = '1'/);
  assert.match(wiring, /stopImmediatePropagation/);
  assert.match(wiring, /if \(values\.amount >= HIGH_JUMP_MIN\) \{\s*highPending = values;\s*return;/);
  assert.match(wiring, /if \(form\.id === 'depositJumpForm'\) \{\s*if \(!highPending\) return;/);
  assert.doesNotMatch(wiring, /proof_path:\s*''/);
});
