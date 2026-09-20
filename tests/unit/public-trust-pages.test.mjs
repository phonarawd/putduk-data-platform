import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const trustHtml = await readFile(new URL('../../dist/trust.html', import.meta.url), 'utf8');
const trustJs = await readFile(new URL('../../dist/assets/trust.js', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8');
const index = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');

const publicPaths = ['/about','/how-it-works','/trial-work','/fees-and-settlement','/faq','/company','/terms','/privacy','/refund-and-dispute'];

test('all public trust paths are static and indexed', async () => {
  for (const path of publicPaths) {
    const routeHtml = await readFile(new URL(`../../dist${path}/index.html`, import.meta.url), 'utf8');
    assert.match(routeHtml, /assets\/trust\.js/);
    assert.ok(sitemap.includes(`<loc>https://app.hiptk.app${path}</loc>`));
  }
});

test('official structured data does not fabricate ratings or reviews', () => {
  assert.match(index, /"@type":"Organization"/);
  assert.match(index, /"@type":"WebSite"/);
  assert.match(trustJs, /'@type':'FAQPage'/);
  assert.doesNotMatch(index + trustJs, /aggregateRating|ratingValue|reviewCount/);
});

test('trial and settlement copy matches the production flow', () => {
  assert.match(trustJs, /체험을 시작하기 위한 회원 선입금은 요구하지 않습니다/);
  assert.match(trustJs, /운영 검수를 통과해 승인된 뒤/);
  assert.match(trustJs, /진행 중 잠기고 정상 완료 시 업무 잔액으로 돌아오며/);
  assert.doesNotMatch(trustHtml + trustJs, /사기가 아니다|100% 안전|무조건 수익/);
});

test('trust shell is crawlable without private member data', () => {
  assert.match(trustHtml, /index,follow/);
  assert.match(trustHtml, /<noscript>/);
  assert.doesNotMatch(trustHtml + trustJs, /supabase|service_role|member_id|user_id/);
});
