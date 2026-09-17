import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles } from '../helpers/repo.mjs';

test('문서 언어·뷰포트·아이콘 접근성 힌트가 있다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  for (const html of [memberHtml, adminHtml]) {
    assert.match(html, /lang="ko"/);
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /rel="manifest"/);
  }
});

test('필수 컨트롤에 한국어 aria-label이 있다', async () => {
  const { appJs } = await readLaunchFiles();
  for (const label of ['메뉴 열기', '테마 전환', '알림', '닫기', '퍼뜩 앱 설치']) {
    assert.match(appJs, new RegExp(`aria-label="${label}"`));
  }
});

test('동작 축소 미디어 쿼리가 있다', async () => {
  const { appCss } = await readLaunchFiles();
  assert.match(appCss, /prefers-reduced-motion:\s*reduce/);
});
