import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('Phase 4 자산은 기존 UIUX 변환 뒤 마지막 표시 보정으로 연결한다', async () => {
  const html = await readRepo('dist', 'index.html');
  const growth = html.indexOf('uiux-growth-2026.js?v=20260919-uiux3');
  const phase4 = html.indexOf('phase4-member-clarity.js?v=20260923-clarity1');
  assert.match(html, /phase4-member-clarity\.css\?v=20260921-phase4/);
  assert.ok(growth >= 0 && phase4 > growth);
});

test('등급 화면은 해금 용어를 설명 가능한 업무 조건 표현으로 바꾸고 밝은 모드 대비를 보강한다', async () => {
  const js = await readRepo('dist', 'assets', 'phase4-member-clarity.js');
  const css = await readRepo('dist', 'assets', 'phase4-member-clarity.css');
  assert.match(js, /회원 단계와 각 단계에서 이용 가능한 업무 범위/);
  assert.match(js, /다음 업무 단계 조건/);
  assert.match(js, /원금 출금 자체로 회원 등급·혜택·라인은 바뀌지 않아요/);
  assert.match(css, /:root:not\(\[data-theme="dark"\]\) \.next-ladder-card/);
  assert.match(css, /\.next-ladder-label\{color:#2d2518!important\}/);
});

test('추천 화면은 서버 기본 보상액·확정 조건·원장 기준을 명시한다', async () => {
  const js = await readRepo('dist', 'assets', 'phase4-member-clarity.js');
  assert.match(js, /기본 보상액<\/span><strong>5,000원/);
  assert.match(js, /실제 입금 · 유효 업무 완료 · 검수 통과/);
  assert.match(js, /조건 확인 후 보상 확정 시 반영/);
  assert.match(js, /실제 금액은 확정 원장 기록 기준/);
});

test('도움말은 빠른 찾기 4개 주제와 접근 가능한 탭 구조를 제공한다', async () => {
  const js = await readRepo('dist', 'assets', 'phase4-member-clarity.js');
  for (const label of ['오늘 근무', '사원증', '정산·지갑', '출금']) assert.match(js, new RegExp(label));
  assert.match(js, /data-phase4-help-index/);
  assert.match(js, /role', 'tablist'/);
  assert.match(js, /aria-selected/);
  assert.match(js, /자주 찾는 추가 안내/);
});

test('Phase 4 표시 모듈은 금융·DB·브라우저 저장소에 직접 접근하지 않는다', async () => {
  const js = await readRepo('dist', 'assets', 'phase4-member-clarity.js');
  for (const forbidden of ['fetch(', 'supabase', 'localStorage', 'sessionStorage', 'wallet_accounts', 'referral_rewards']) {
    assert.ok(!js.includes(forbidden), `forbidden direct dependency: ${forbidden}`);
  }
});
