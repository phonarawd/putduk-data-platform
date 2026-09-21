import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../dist/assets/fomo-bot-runtime.js', import.meta.url), 'utf8');

test('member HTML loads the FOMO bot runtime after app.js', () => {
  const appPos = index.indexOf('./assets/app.js');
  const fomoPos = index.indexOf('./assets/fomo-bot-runtime.js');
  assert.ok(appPos >= 0);
  assert.ok(fomoPos > appPos);
});

test('FOMO bot runtime keeps rotating names, actions, crowd and slot depletion', () => {
  assert.match(runtime, /NAME_POOL/);
  assert.match(runtime, /방금 출근했어요/);
  assert.match(runtime, /자리를 가져갔어요/);
  assert.match(runtime, /라인에 들어왔어요/);
  assert.match(runtime, /근무를 시작했어요/);
  assert.match(runtime, /Math\.sin\(Date\.now\(\) \/ 9000\)/);
  assert.match(runtime, /burn_per_minute/);
  assert.match(runtime, /자리 남음/);
});

test('visible FOMO board is restored instead of real-activity copy', () => {
  assert.match(runtime, /지금 활동/);
  assert.match(runtime, /자리 소진/);
  assert.match(runtime, /방금 들어온 크루/);
  assert.doesNotMatch(runtime, /실제 최근 활동|실제 업무 현황|최근 30분 동안 공개할 실제 활동이 없습니다/);
});
