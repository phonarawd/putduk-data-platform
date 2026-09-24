import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('회원 출시 화면은 실제 서버 기능이 없는 내역 내려받기 버튼을 노출하지 않는다', async () => {
  const guard = await readRepo('dist', 'assets', 'launch-readiness-guard.js');
  const indexHtml = await readRepo('dist', 'index.html');
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(indexHtml, /launch-readiness-guard\.js\?v=20260920-p0ready1/);
  assert.match(guard, /\[data-action="export-history"\]/);
  assert.match(guard, /action === 'export-history'/);
  assert.match(guard, /target\.remove\(\)/);
  assert.equal(appJs.includes("data-action=\"export-history\""), false);
  assert.equal(appJs.includes("action === 'export-history'"), false);
});

test('비동기·재고 상태 문구는 개발 중 표현 대신 실제 상태로 표시한다', async () => {
  const guard = await readRepo('dist', 'assets', 'launch-readiness-guard.js');
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(guard, /\['회원번호 준비 중', '회원번호 확인 중'\]/);
  assert.match(guard, /\['코드 준비 중', '추천 코드 확인 중'\]/);
  assert.match(guard, /\['첫 업무 준비 중', '현재 가능한 첫 업무 없음'\]/);
  assert.match(guard, /new MutationObserver/);
  assert.match(appJs, /회원번호 확인 중/);
  assert.match(appJs, /추천 코드 확인 중/);
  assert.match(appJs, /현재 가능한 첫 업무 없음/);
  assert.equal(appJs.includes('회원번호 준비 중'), false);
  assert.equal(appJs.includes('코드 준비 중'), false);
  assert.equal(appJs.includes('첫 업무 준비 중'), false);
});

test('지원금 캠페인 서버 저장 계약이 없으면 운영 설정 저장 버튼을 잠근다', async () => {
  const guard = await readRepo('dist', 'assets', 'launch-readiness-guard.js');
  const adminIndex = await readRepo('dist', 'admin', 'index.html');

  assert.match(adminIndex, /launch-readiness-guard\.js\?v=20260920-p0ready1/);
  assert.match(guard, /지원금 캠페인 저장 계약/);
  assert.match(guard, /button\.disabled = true/);
  assert.match(guard, /button\.textContent = '서버 연결 필요'/);
  assert.match(guard, /data\.launchReadinessLocked|dataset\.launchReadinessLocked/);
});

test('P0 전수조사 문서는 안전 잠금과 제거 대상을 구분하고 보호영역을 명시한다', async () => {
  const audit = await readRepo('docs', 'P0_LAUNCH_READINESS_AUDIT.md');

  assert.match(audit, /의도적 안전 잠금/);
  assert.match(audit, /내역 내려받기/);
  assert.match(audit, /renderAuthModal\(\)/);
  assert.match(audit, /faq/);
  assert.match(audit, /bot_enabled/);
  assert.match(audit, /crowd_min/);
  assert.match(audit, /crowd_max/);
  assert.match(audit, /burn_per_minute/);
  assert.match(audit, /crew_pulse/);
});
