import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('도움말은 질문 문장형 FAQ로 재구성한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');

  assert.match(appJs, /function renderSupportPage\(\)/);
  assert.match(appJs, /const faq = \(question, answer\)/);
  assert.match(appJs, /class="help-faq"/);
  assert.match(appJs, /class="help-faq-body"/);
  assert.match(css, /\.help-faq \{/);
  assert.match(css, /\.help-faq summary \{/);
  assert.match(css, /\.help-faq-body \{/);
  // 카드형 대시보드 구조는 제거한다.
  assert.doesNotMatch(appJs.slice(appJs.indexOf('function renderSupportPage'), appJs.indexOf('function renderMemberPage')), /help-cards/);
});

test('4개 탭과 12개 질문을 질문 문장으로 제공한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.ok(supportBlock.length > 300);

  for (const label of ['오늘 근무', '사원증', '정산·지갑', '출금']) assert.match(supportBlock, new RegExp(label));
  for (const question of [
    '출근은 어떻게 하나요?',
    '검수는 언제 끝나나요?',
    'PC에서도 근무할 수 있나요?',
    '사원번호는 무엇인가요?',
    '협력사 배지는 왜 바뀌나요?',
    '등급·혜택은 어디서 보나요?',
    '지갑의 세 칸은 무엇인가요?',
    '근무 보증금은 언제 돌아오나요?',
    '화면의 금액은 어떻게 정해지나요?',
    '수당은 어떻게 출금하나요?',
    '원금도 출금할 수 있나요?',
    '첫 출금은 어떻게 하나요?'
  ]) assert.ok(supportBlock.includes(question), `질문 누락: ${question}`);
});

test('핵심 규칙 문구는 그대로 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.match(supportBlock, /PDK-로 시작하는 번호가 사원번호예요/);
  assert.match(supportBlock, /지원금·업무잔액·출금가능\. 세 칸은 섞이지 않아요\./);
  assert.match(supportBlock, /승인되면 원금은 업무잔액으로, 수당은 출금가능 칸에 반영돼요/);
  assert.match(supportBlock, /✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요/);
  assert.match(supportBlock, /지갑의 큰 버튼은 수당만 출금이에요/);
  assert.match(supportBlock, /완료된 원금만큼 업무잔액이 줄어요\. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요\./);
  assert.match(supportBlock, /체험 수당 3천 원은 1회만, 원화 계좌로 신청할 수 있어요/);
  assert.match(supportBlock, /서버가 정해요\. 화면에서 숫자를 더하거나 빼지 않아요\./);
  assert.match(supportBlock, /등급·혜택 보기/);
  assert.match(supportBlock, /퍼뜩 멤버십 운영이며, 근로계약·4대보험·협력사 인사 채용은 아니에요\./);
});

test('불필요한 부속물은 제거한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  // 상담은 패널 대신 한 줄 텍스트 링크로.
  assert.doesNotMatch(supportBlock, /help-channel/);
  assert.doesNotMatch(supportBlock, /실시간 상담/);
  assert.match(supportBlock, /help-contact-line/);
  assert.match(supportBlock, /답을 못 찾았으면/);
  assert.match(supportBlock, /open-channel-talk/);
  // 아코디언 섹션 전체 제거 — 질문 목록으로 흡수.
  assert.doesNotMatch(supportBlock, /help-accordion/);
});

test('legal 고지 한 줄은 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const supportBlock = appJs.slice(
    appJs.indexOf('function renderSupportPage()'),
    appJs.indexOf('function renderMemberPage()')
  );
  assert.match(supportBlock, /help-legal/);
});

test('도움말 FAQ 개편은 FOMO·봇 보호 설정을 건드리지 않는다', async () => {
  const [appJs, css] = await Promise.all([
    readRepo('dist', 'assets', 'app-ia13.js'),
    readRepo('dist', 'assets', 'app.css')
  ]);
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute']) {
    assert.ok(appJs.includes(protectedName), `app-ia13.js에 ${protectedName} FOMO 계약이 사라졌어요`);
    assert.equal(css.includes(protectedName), false, `app.css에 ${protectedName} 추가 금지`);
  }
});
