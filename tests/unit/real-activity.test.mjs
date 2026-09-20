import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../../dist/assets/app.js', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../../supabase/functions/member-experience/index.ts', import.meta.url), 'utf8');
test('synthetic FOMO generators and fake urgency are removed', () => {
  assert.doesNotMatch(app, /FOMO_NAME_POOL|FOMO_SURNAMES|FOMO_GIVEN|FOMO_ACTIONS|fomoRng|fomoShuffle|Math\.sin\(Date\.now/);
  assert.doesNotMatch(app, /자리를 가져갔어요|라인에 들어왔어요/);
});
test('member UI reads authenticated real activity from Edge', () => {
  assert.match(app, /action: 'real_activity'/);
  assert.match(app, /Authorization.*Bearer/);
  assert.match(app, /현재 진행 중/);
  assert.match(app, /최근 15분 시작/);
  assert.match(app, /최근 30분 동안 공개할 실제 활동이 없습니다/);
});
test('Edge returns aggregate anonymous activity only', () => {
  assert.match(edge, /action === "real_activity"/);
  assert.match(edge, /active_count/);
  assert.match(edge, /started_15m/);
  assert.doesNotMatch(edge, /select\(".*user_id/);
});
test('slot copy no longer applies synthetic depletion', () => {
  assert.match(app, /return Math\.max\(0, Number\(node\?\.available \|\| 0\)\)/);
  assert.doesNotMatch(app, /burned|fomoSeed/);
});
