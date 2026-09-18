import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

test('등급 카드는 세로 사다리와 톤·숫자 배지를 쓴다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appJs, /data-tone="\$\{esc\(band\.tone/);
  assert.match(appJs, /benefit-badge/);
  assert.match(appJs, /benefit-stats/);
  assert.match(appCss, /data-tone="line"/);
  assert.match(appCss, /data-tone="desk"/);
  assert.match(appJs, /이 등급·혜택은 근무 기회를 나누는 기준이에요\. 이율이나 이자는 없어요/);
});

test('사원증은 진짜 3D 뒤집기를 쓰고 hidden으로 면을 숨기지 않는다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appCss, /perspective:\s*1200px/);
  assert.match(appCss, /preserve-3d/);
  assert.match(appJs, /class="id-face id-front">/);
  assert.match(appJs, /class="id-face id-back">/);
  assert.equal(appJs.includes('id-front"${flipped'), false);
});

test('라인 찾기는 FOMO를 중복하지 않고 필터 안내가 있다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /renderFomoBoard\('dashboard'\)/);
  assert.equal(appJs.includes("renderFomoBoard('nodes')"), false);
  assert.match(appJs, /NODE_FILTER_HINTS/);
  assert.match(appJs, /nodeFilterHint/);
});

test('입금은 원화·USDT를 먼저 고른다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /data-deposit-method="krw"/);
  assert.match(appJs, /data-deposit-method="usdt"/);
  assert.match(appJs, /depositMethod/);
});

test('관리자 입출금은 다섯 탭이고 모바일 카드가 있다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminCss = await readRepo('dist', 'admin', 'admin.css');
  assert.match(adminJs, /data-finance-tab="\$\{item\.id\}"/);
  assert.match(adminJs, /id: 'payouts'/);
  assert.match(adminJs, /id: 'deposits'/);
  assert.match(adminJs, /id: 'krw'/);
  assert.match(adminJs, /id: 'usdt'/);
  assert.match(adminJs, /id: 'security'/);
  assert.match(adminJs, /admin-mobile-card/);
  assert.match(adminCss, /admin-mobile-cards/);
});
