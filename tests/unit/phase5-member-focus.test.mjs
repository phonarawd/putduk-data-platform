import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const js = fs.readFileSync(path.join(root, 'dist/assets/phase5-member-focus.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dist/assets/phase5-member-focus.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');

test('zero/loading progress uses rendered wallet truth and avoids fake 0% gauge', () => {
  assert.match(js, /workText === '확인 필요'/);
  assert.match(js, /workAmount <= 0/);
  assert.match(js, /0% 게이지 대신 실제 잔액이 반영된 뒤/);
  assert.match(js, /data-phase5-progress-original/);
});

test('phase5 does not read finance/server/storage truth directly', () => {
  assert.doesNotMatch(js, /fetch\s*\(/);
  assert.doesNotMatch(js, /supabase/i);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /wallet_accounts|ledger_entries|referral_rewards/);
});

test('fomo zero state remains truthful instead of implying urgency', () => {
  assert.match(js, /현재 확인된 최근 활동 없음/);
  assert.match(js, /metrics\.every\(\(value\) => value === 0\)/);
  assert.match(js, /fomo-feed-empty/);
});

test('membership keeps tier on card front and removes duplicate header/back labels', () => {
  assert.match(js, /phase5DuplicateTier = 'header'/);
  assert.match(js, /phase5DuplicateTier = 'back'/);
  assert.doesNotMatch(js, /querySelector\('\.id-band'\).*hidden/);
  assert.match(js, /현재 등급은 카드 앞면에 한 번만 표시/);
});

test('phase5 styles and index wiring load after phase4 clarity', () => {
  assert.match(css, /phase5-progress-zero/);
  assert.match(css, /phase5-fomo-empty/);
  assert.match(css, /phase5-membership-focus/);
  const phase4Css = index.indexOf('phase4-member-clarity.css');
  const phase5Css = index.indexOf('phase5-member-focus.css');
  const phase4Js = index.indexOf('phase4-member-clarity.js');
  const phase5Js = index.indexOf('phase5-member-focus.js');
  assert.ok(phase4Css >= 0 && phase5Css > phase4Css);
  assert.ok(phase4Js >= 0 && phase5Js > phase4Js);
});
