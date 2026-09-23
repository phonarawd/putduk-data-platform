import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('회원 토스트 정책 가드는 회원 모드와 단일 toastStack에만 적용된다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  assert.match(guard, /dataset\.mode !== 'member'/);
  assert.match(guard, /getElementById\('toastStack'\)/);
  assert.match(guard, /MutationObserver/);
  assert.doesNotMatch(guard, /appendChild\([^\n]*toast/i);
});

test('핵심 서버 접수와 실시간 도착은 토스트로 유지한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  for (const copy of ['근무 제출이 완료됐어요', '입금 신청을 접수했어요', '출금 신청을 접수했어요', '새 근무가 배정됐어요', '새 안내가 도착했어요']) {
    assert.ok(guard.includes(copy), `유지 문구 누락: ${copy}`);
  }
  assert.match(guard, /tone === 'error' \|\| tone === 'warning'\) return 'keep'/);
});

test('입력 검증·인증·저장·일반 안내는 인라인 처리한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  assert.match(guard, /INLINE_PATTERNS/);
  assert.match(guard, /PIN\|비밀번호\|이메일\|생년월일/);
  assert.match(guard, /증빙\|파일을 확인/);
  assert.match(guard, /중간 저장\|화면에는 남겼어요\|서버 저장/);
  assert.match(guard, /data-putduk-inline-feedback/);
  assert.match(guard, /placeInline\(toastText\(node\), toneOf\(node\)\)/);
});

test('원금 출금 강등과 중복 화면이동 안내는 제거한다', async () => {
  const guard = await readRepo('dist', 'assets', 'toast-policy-guard.js');
  assert.match(guard, /등급과 라인이 내려가는 출금/);
  assert.match(guard, /배정된 라인을 라인 찾기에서 확인해요/);
  assert.match(guard, /if \(disposition === 'keep'\) return;/);
  assert.match(guard, /node\.remove\(\)/);
});

test('회원 문서는 새 정책 가드를 app.js 다음에 로드하고 구 출금 전용 가드는 로드하지 않는다', async () => {
  const html = await readRepo('dist', 'index.html');
  assert.match(html, /app-ia13\.js\?v=20260924-phase10f[\s\S]*toast-policy-guard\.js\?v=20260920-toast4/);
  assert.doesNotMatch(html, /withdrawal-policy-guard\.js/);
});
