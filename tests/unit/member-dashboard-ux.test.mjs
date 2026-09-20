import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('회원 홈은 지원금·내 원금·승인 수당의 의미를 분리해 안내한다', async () => {
  const js = await readRepo('dist', 'assets', 'member-dashboard-ux.js');
  const html = await readRepo('dist', 'index.html');

  assert.match(html, /member-dashboard-ux\.css\?v=20260920-p1dash1/);
  assert.match(html, /member-dashboard-ux\.js\?v=20260920-p1dash1/);
  assert.match(js, /업무 전용 · 출금 불가/);
  assert.match(js, /내 원금 · 업무 시작에 사용/);
  assert.match(js, /승인 수당 · 출금 신청 가능/);
  assert.match(js, /지원금은 업무 전용 · 업무잔액은 내 원금 · 출금가능은 승인된 수당/);
});

test('진행 중·검수 대기 상태는 홈 첫 화면의 다음 행동으로 승격한다', async () => {
  const js = await readRepo('dist', 'assets', 'member-dashboard-ux.js');

  assert.match(js, /\[data-action="open-run"\]/);
  assert.match(js, /\[data-action="open-review-wait"\]/);
  assert.match(js, /dashboard-next-action/);
  assert.match(js, /hero\.before\(stateNotice\)/);
  assert.match(js, /다음 할 일 · 오늘 업무 선택/);
  assert.match(js, /오늘 업무 보기/);
});

test('지원금이 남아 있으면 홈에서 입금을 우선 행동으로 밀지 않는다', async () => {
  const js = await readRepo('dist', 'assets', 'member-dashboard-ux.js');

  assert.match(js, /supportAvailable = Boolean\(support && !support\.classList\.contains\('is-zero'\)\)/);
  assert.match(js, /deposit\.hidden = supportAvailable/);
  assert.match(js, /업무잔액 충전/);
});

test('모바일에서는 다음 행동과 지갑 CTA가 한 열로 정리된다', async () => {
  const css = await readRepo('dist', 'assets', 'member-dashboard-ux.css');

  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.dashboard-next-action[\s\S]*flex-direction:column/);
  assert.match(css, /\.wallet-card \.wallet-cta[\s\S]*grid-template-columns:1fr/);
});

test('회원 홈 UX 가드는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const js = await readRepo('dist', 'assets', 'member-dashboard-ux.js');
  const css = await readRepo('dist', 'assets', 'member-dashboard-ux.css');
  const combined = `${js}\n${css}`;

  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    assert.doesNotMatch(combined, new RegExp(protectedName));
  }
});
