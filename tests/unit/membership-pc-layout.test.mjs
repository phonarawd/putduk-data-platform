import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('PC 사원증 페이지는 뷰포트 높이 강제와 수직 자동 여백을 제거한다', async () => {
  const css = await readRepo('dist', 'assets', 'app.css');

  const pcBlock = css.slice(css.indexOf('.main:has(.membership-page)'), css.indexOf('@media (max-width: 840px) {\n  html[data-mode="member"] .main:has(.membership-page)'));
  assert.ok(pcBlock.length > 200);

  assert.match(pcBlock, /min-height:\s*0/);
  assert.doesNotMatch(pcBlock, /min-height:\s*100vh/);
  assert.match(pcBlock, /padding-bottom:\s*16px/);
  assert.doesNotMatch(pcBlock, /margin-top:\s*auto/);
  assert.match(pcBlock, /margin-top:\s*0/);
  assert.match(pcBlock, /margin-bottom:\s*auto/);
});

test('PC 사원증 카드는 680px 컨테이너 안에서 확장되고 스테이지 여백이 축소된다', async () => {
  const css = await readRepo('dist', 'assets', 'app.css');

  const pcBlock = css.slice(css.indexOf('.main:has(.membership-page)'), css.indexOf('@media (max-width: 840px) {\n  html[data-mode="member"] .main:has(.membership-page)'));
  assert.match(pcBlock, /\.membership-stage \{\s*padding:\s*20px 24px 18px/);
  assert.match(pcBlock, /\.membership-page \.id-stage,/);
  assert.match(pcBlock, /max-width:\s*560px/);
  assert.match(pcBlock, /margin:\s*0 auto/);

  // 컨테이너 상한은 유지
  const containerBlock = css.slice(css.indexOf('.membership-page {'), css.indexOf('.membership-page .section-heading'));
  assert.match(containerBlock, /max-width:\s*680px/);
});

test('PC 카드 폼팩터와 사원증 콘텐츠 규칙은 유지된다', async () => {
  const css = await readRepo('dist', 'assets', 'app.css');

  assert.match(css, /min-height:\s*calc\(100cqw \* 53\.98 \/ 85\.6\)/);
  assert.match(css, /container-name:\s*idcard/);
  assert.match(css, /\.id-flip-inner \{/);
  assert.match(css, /rotateY\(180deg\)/);
});

test('모바일(≤840px) 사원증 규칙은 변경되지 않는다', async () => {
  const css = await readRepo('dist', 'assets', 'app.css');

  const mobileBlock = css.slice(css.indexOf('@media (max-width: 840px) {'));
  assert.match(mobileBlock, /padding-bottom:\s*calc\(28px \+ var\(--member-tabbar-stack\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileBlock, /flex:\s*0 1 auto/);
  assert.match(mobileBlock, /grid-template-columns:\s*64px minmax\(0,\s*1fr\)/);
});

test('사원증 PC 여백 최적화는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const css = await readRepo('dist', 'assets', 'app.css');
  assert.doesNotMatch(css, /bot_enabled|crowd_min|crowd_max|burn_per_minute|crew_pulse/);
});

test('회원 문서는 사원증 PC 레이아웃 캐시 버스트를 반영한다', async () => {
  const html = await readRepo('dist', 'index.html');
  assert.match(html, /app\.css\?v=20260924-phase41f1/);
});
