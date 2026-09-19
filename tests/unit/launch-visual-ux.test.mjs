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
  assert.match(appJs, /depositMethod \|\| ''/);
});

test('관리자 입출금은 다섯 탭이고 모바일 카드가 있으며 지급정보 확인 후 완료한다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminCss = await readRepo('dist', 'admin', 'admin.css');
  const safety = await readRepo('dist', 'admin', 'withdrawal-safety.js');
  assert.match(adminJs, /data-finance-tab="\$\{item\.id\}"/);
  assert.match(adminJs, /id: 'payouts'/);
  assert.match(adminJs, /id: 'deposits'/);
  assert.match(adminJs, /id: 'krw'/);
  assert.match(adminJs, /id: 'usdt'/);
  assert.match(adminJs, /id: 'security'/);
  assert.match(adminJs, /admin-mobile-card/);
  assert.match(adminCss, /admin-mobile-cards/);
  assert.match(adminJs, /reveal-withdrawal-destination/);
  assert.match(adminJs, /withdraw-complete/);
  assert.match(safety, /REVEAL_WINDOW_MS = 60_000/);
  assert.match(safety, /지급정보를 먼저 확인한 뒤 60초 안에 완료해 주세요/);
  assert.match(safety, /stopImmediatePropagation\(\)/);
});

test('관리자 UIUX는 MutationObserver 자기증폭 없이 렌더 버스트를 프레임 단위로 합친다', async () => {
  const adminIndex = await readRepo('dist', 'admin', 'index.html');
  const adminUiux = await readRepo('dist', 'admin', 'uiux-admin-premium-2026.js');

  assert.equal(adminIndex.includes('assets/uiux-final-2026.js'), false);
  assert.match(adminIndex, /uiux-admin-premium-2026\.js\?v=20260920-perf2/);
  assert.match(adminUiux, /observer\?\.disconnect\(\)/);
  assert.match(adminUiux, /requestAnimationFrame\(\(\) =>/);
  assert.match(adminUiux, /if \(node\.textContent !== next\) node\.textContent = next/);
  assert.match(adminUiux, /if \(queued \|\| enhancing\) return/);
});

test('관리자 잔액조정은 전용 안전 핸들러가 최종 원장 호출과 중복 제출 차단을 보장한다', async () => {
  const adminIndex = await readRepo('dist', 'admin', 'index.html');
  const safety = await readRepo('dist', 'admin', 'balance-adjust-safety.js');

  assert.match(adminIndex, /balance-adjust-safety\.js\?v=20260920-b1/);
  assert.match(safety, /balanceAdjustForm/);
  assert.match(safety, /stopImmediatePropagation\(\)/);
  assert.match(safety, /balanceAdjustBusy/);
  assert.match(safety, /adminRequest\('adjust_balance'/);
  assert.match(safety, /\['support_grant', 'work_balance', 'available'\]/);
  assert.match(safety, /confirmAmount: payload\.amount/);
  assert.match(safety, /loadAdminMembers/);
});
