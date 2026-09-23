import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('원금 출금 회원 UI는 강등·라인 폐쇄 대신 실제 잔액 계약을 안내한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  const indexHtml = await readRepo('dist', 'index.html');

  assert.match(indexHtml, /toast-policy-guard\.js\?v=20260924-toast5/);
  assert.match(guard, /WITHDRAWAL_COPY_REPLACEMENTS/);
  assert.match(guard, /회원 등급은 출금 자체로 변경되지 않아요/);
  assert.match(guard, /출금 자체로 회원 등급을 낮추지 않아요/);
  assert.match(guard, /출금 완료 후 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요/);
  assert.match(guard, /기존 회원 등급·혜택·라인 상태는 원금 출금 자체로 변경하지 않아요/);
  assert.match(guard, /운영자가 확인한 뒤 \$1까지 지급 처리해요/);
});

test('도움말의 원금 출금 강등·라인 하락 문구와 링크 이름을 실제 계약으로 치환한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  const appJs = await readRepo('dist', 'assets', 'app.js');

  const staleHelpCopy = '보증금까지 신청하면 대기 일수 없이 바로 지급하고, 등급과 라인은 내려가요.';
  const staleHelpLink = '강등·혜택 안내';

  assert.ok(!appJs.includes(staleHelpCopy) || guard.includes(staleHelpCopy));
  assert.ok(!appJs.includes(staleHelpLink) || guard.includes(staleHelpLink));
  assert.match(guard, /원금까지 신청하면 운영자 확인 후 지급 처리되며, 완료된 원금만큼 업무잔액이 줄어요\. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요\./);
  assert.match(guard, /'강등·혜택 안내',\s*'등급·혜택 보기'/);
  assert.match(guard, /for \(const \[from, to\] of WITHDRAWAL_COPY_REPLACEMENTS\)/);
});

test('원금 출금 강등 토스트와 강등 연출은 회원 화면에서 제거한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');

  assert.match(guard, /등급과 라인이 내려가는 출금/);
  assert.match(guard, /등급이 내려갔어요/);
  assert.match(guard, /사원증 등급이/);
  assert.match(guard, /if \(disposition === 'keep'\) return/);
  assert.match(guard, /node\.remove\(\)/);
  assert.match(guard, /#demoteMotionCanvas\{display:none!important\}/);
  assert.match(guard, /motionStage\.remove\(\)/);
  assert.match(guard, /confirm\.textContent = '출금 정보 입력'/);
});

test('회원 UI 재렌더 후에도 원금 출금 정책 정정을 다시 적용한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');

  assert.match(guard, /function installWithdrawalPolicy\(\)/);
  assert.match(guard, /sanitizeWithdrawalPolicy\(app\)/);
  assert.match(guard, /new MutationObserver/);
  assert.match(guard, /sanitizeWithdrawalPolicy\(node\)/);
  assert.match(guard, /observer\.observe\(app, \{ childList: true, subtree: true \}\)/);
});
