import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECT_TOTAL,
  inspectSeedFromRunId,
  inspectBundleItems,
  gradeInspectAnswers,
  normalizeInspectChoice
} from '../../src/work/inspect-bundle.mjs';
import {
  catalogListingForRun,
  gradeCatalogListing,
  isCatalogWork
} from '../../src/work/catalog-listing.mjs';
import { readLaunchFiles } from '../helpers/repo.mjs';

const SAMPLE_RUN = '11111111-1111-4111-8111-111111111111';

test('런 UUID로 5건 중 2건은 끝자리가 어긋난다', () => {
  assert.equal(inspectSeedFromRunId(SAMPLE_RUN), 0x11111111);
  const items = inspectBundleItems(SAMPLE_RUN);
  assert.equal(items.length, INSPECT_TOTAL);
  const mismatches = items.filter((item) => item.match === false);
  assert.equal(mismatches.length, 2);
  assert.equal(items[0].expectedChoice, 'no');
  assert.equal(items[3].expectedChoice, 'no');
  assert.notEqual(items[0].invoiceCode, items[0].targetCode);
  assert.equal(items[1].invoiceCode, items[1].targetCode);
});

test('정답 5건만 통과하고 한 칸이 틀리면 거절한다', () => {
  const items = inspectBundleItems(SAMPLE_RUN);
  const correct = items.map((item) => item.expectedChoice);
  assert.equal(gradeInspectAnswers(SAMPLE_RUN, correct).ok, true);
  const wrong = [...correct];
  wrong[0] = 'yes';
  assert.equal(gradeInspectAnswers(SAMPLE_RUN, wrong).ok, false);
  assert.equal(gradeInspectAnswers(SAMPLE_RUN, correct.slice(0, 1)).ok, false);
  assert.equal(normalizeInspectChoice('no'), 'no');
});

test('회원 앱에 5건 강제·불일치·햅틱·검수 제출이 있다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appJs, /INSPECT_TOTAL = 5/);
  assert.match(appJs, /navigator\.vibrate/);
  assert.match(appJs, /inspect_answers:/);
  assert.match(appJs, /isInspectBundleComplete/);
  assert.match(appJs, /confirmInspectLabel/);
  assert.match(appCss, /\.wms-code-tail/);
  assert.match(appJs, /if \(state\.player\) \{\s*runFrame = null;/);
});

test('카탈로그 근무는 상품명·가격·옵션·배송을 카드와 같게 입력한다', () => {
  const listing = catalogListingForRun(SAMPLE_RUN);
  assert.equal(isCatalogWork({ motion: 'commerce_catalog' }), true);
  assert.equal(isCatalogWork({ motion: 'road_logistics' }), false);
  assert.equal(gradeCatalogListing(SAMPLE_RUN, listing).ok, true);
  assert.equal(gradeCatalogListing(SAMPLE_RUN, { ...listing, price: '1' }).ok, false);
});
