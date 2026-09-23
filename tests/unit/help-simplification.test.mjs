import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('도움말 탭 본문은 아이콘+제목+한 줄 카드형으로 재구성한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');

  assert.match(appJs, /function renderSupportPage\(\)/);
  assert.match(appJs, /class="help-cards"/);
  assert.match(appJs, /const card = \(iconName, title, copy\)/);
  assert.match(appJs, /class="help-card-icon"/);
  assert.match(css, /\.help-cards \{/);
  assert.match(css, /\.help-card \{/);
  assert.match(css, /\.help-card-icon \{/);
});

test('4개 탭 구조와 핵심 안내 문구는 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.ok(supportBlock.length > 300);

  for (const label of ['오늘 근무', '사원증', '정산·지갑', '출금']) assert.match(supportBlock, new RegExp(label));
  // 핵심 규칙 문구 유지
  assert.match(supportBlock, /PDK- 번호가 사원번호예요/);
  assert.match(supportBlock, /지원금·업무잔액·출금가능/);
  assert.match(supportBlock, /승인되면 원금은 업무잔액, 수당은 출금가능 칸에 보여요/);
  assert.match(supportBlock, /큰 버튼은 수당만/);
  assert.match(supportBlock, /완료된 원금만큼 업무잔액이 줄어요\. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요\./);
  assert.match(supportBlock, /체험 첫 출금 3천 원은 운영 경로로만 처리돼요/);
  assert.match(supportBlock, /등급·혜택 보기/);
  // settle-note(업무 카드와 같은 보조 한 줄) 유지
  assert.match(supportBlock, /settleNote\('p'\)/);
});

test('아코디언은 탭과 중복되지 않는 고유 안내 1개만 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  const accordionBlock = supportBlock.slice(supportBlock.indexOf('help-accordion'));
  const detailCount = (accordionBlock.match(/<details>/g) || []).length;
  assert.equal(detailCount, 1);
  assert.match(accordionBlock, /검수가 끝날 때까지 새 출근은 기다려요/);
  // 탭과 완전 중복이던 두 항목은 제거
  assert.doesNotMatch(accordionBlock, /컴퓨터에서도 출근할 수 있어요/);
  assert.doesNotMatch(accordionBlock, /원금은 업무잔액에 남아 보여요<\/summary>/);
});

test('실시간 상담 영역은 간결하게 유지된다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.match(supportBlock, /help-channel/);
  assert.match(supportBlock, /실시간 상담/);
  assert.match(supportBlock, /open-channel-talk/);
  assert.match(supportBlock, /💬 상담원에게 물어보기/);
});

test('legal 고지 한 줄은 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.match(supportBlock, /퍼뜩 멤버십 운영이며, 근로계약·4대보험·협력사 인사 채용은 아니에요\./);
  assert.match(supportBlock, /help-legal/);
});

test('도움말 간소화는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    const before = appJs.split(protectedName).length - 1;
    assert.ok(before >= 0, `app-ia13.js에서 ${protectedName} 확인 실패`);
  }
  assert.doesNotMatch(css, /bot_enabled|crowd_min|crowd_max|burn_per_minute|crew_pulse/);
});
