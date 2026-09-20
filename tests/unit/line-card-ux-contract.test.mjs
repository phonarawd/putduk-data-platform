import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('회원 업무 카드는 체험 지원금과 일반 업무 잔액을 분리해서 표시한다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');

  assert.match(guard, /체험 지원금 사용/);
  assert.match(guard, /필요 업무 잔액/);
  assert.match(guard, /지원금 자체는 출금되지 않아요/);
  assert.match(guard, /업무 잔액에서 잠금/);
  assert.match(guard, /승인 시 수당/);
});

test('업무 카드 CTA는 시작 가능·잔액 부족·체험 지원금 없음·진행 중·검수 대기를 구분한다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');

  assert.match(guard, /ready: '시작 가능'/);
  assert.match(guard, /insufficient: '업무 잔액 부족'/);
  assert.match(guard, /'support-missing': '체험 지원금 없음'/);
  assert.match(guard, /'active-run': '업무 진행 중'/);
  assert.match(guard, /review: '검수 대기'/);
  assert.match(guard, /setText\(button, '입금 안내 보기'\)/);
  assert.match(guard, /setText\(button, '체험 지원금 필요'\)/);
  assert.match(guard, /setText\(button, '진행 중 업무 먼저 완료'\)/);
});

test('진행 중 업무는 현재 Supabase 세션 사용자 전용 저장 상태로 판별한다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');

  assert.match(guard, /sb-\$\{projectRef\}-auth-token/);
  assert.match(guard, /putduk-state-v2:\$\{userId\}/);
  assert.match(guard, /Boolean\(parsed\?\.run && parsed\.run\.nodeId\)/);
  assert.match(guard, /hasPersistedActiveRun\(\)/);
});

test('업무 매칭 안내는 자금 출처·승인 수당·예상 소요를 먼저 설명한다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');

  assert.match(guard, /체험은 지원금을 사용하고, 일반 업무는 업무 잔액을 잠급니다/);
  assert.match(guard, /중간 금액대 업무입니다/);
  assert.match(guard, /초고액 업무는 운영자 배정이 필요한 경우에만 표시됩니다/);
});

test('모바일 카드 CTA는 한 열 전체 폭으로 유지한다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');

  assert.match(guard, /@media \(max-width:640px\)/);
  assert.match(guard, /\.node-bottom \.small-button\{width:100%;min-height:48px\}/);
});

test('line-card UX는 uiux-final보다 먼저 로드되어 원래 자금 라벨을 보존한다', async () => {
  const html = await readRepo('dist', 'index.html');
  const guardIndex = html.indexOf('line-card-ux.js?v=20260920-p1line2');
  const finalIndex = html.indexOf('uiux-final-2026.js?v=20260919-uiux1');

  assert.ok(guardIndex >= 0, 'line-card-ux script must be wired');
  assert.ok(finalIndex > guardIndex, 'line-card-ux must run before uiux-final relabeling');
});

test('line-card UX는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const guard = await readRepo('dist', 'assets', 'line-card-ux.js');
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    assert.doesNotMatch(guard, new RegExp(protectedName));
  }
});
