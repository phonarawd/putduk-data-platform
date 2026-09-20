import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../dist/assets/app.js', import.meta.url), 'utf8');
const finance = await readFile(new URL('../../dist/assets/phase4-finance-wiring.js', import.meta.url), 'utf8');

test('toast engine displays only one message at a time', () => {
  assert.match(app, /stack\.replaceChildren\(toast\)/);
  assert.match(app, /toastTimers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
});

test('finance uses the shared toast engine', () => {
  const toastBlock = finance.slice(finance.indexOf('function toast('), finance.indexOf('async function edge('));
  assert.match(finance, /window\.__putdukShowToast\(text, kind\)/);
  assert.doesNotMatch(toastBlock, /document\.createElement\(['"]div['"]\)/);
});

test('low-value member actions do not trigger toast messages', () => {
  for (const copy of [
    '다시 만나서 반가워요',
    '안전하게 로그아웃했어요',
    '추천 코드 ${referralCode()}을 복사했어요',
    '대조 완료! 다음 화물을 확인해 주세요',
    '근무 화면을 열었어요'
  ]) assert.ok(!app.includes(copy), copy);
});

test('critical member receipts remain', () => {
  assert.match(app, /근무 제출이 완료됐어요/);
  assert.match(app, /입금 신청을 접수했어요/);
  assert.match(app, /출금 신청을 접수했어요/);
});
