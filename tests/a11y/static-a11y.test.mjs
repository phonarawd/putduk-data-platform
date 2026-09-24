import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

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
  for (const label of ['메뉴 열기', '테마 전환', '알림', '닫기', '퍼뜩 앱 설치', 'KYC 창 닫기', '알림 창 닫기', '추천 코드 복사', '상담원에게 물어보기']) {
    if (label === '알림') {
      assert.match(appJs, /aria-label="알림/);
      continue;
    }
    assert.match(appJs, new RegExp(`aria-label="${label}"`));
  }
});

test('동작 축소 미디어 쿼리가 있다', async () => {
  const { appCss } = await readLaunchFiles();
  assert.match(appCss, /prefers-reduced-motion:\s*reduce/);
});

test('기존 phase9 모달 focus 계약이 유지된다', async () => {
  const runtime = await readRepo('dist', 'assets', 'phase9-a11y-performance.js');
  assert.match(runtime, /dialog\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(runtime, /let restoreFocus = null/);
  assert.match(runtime, /restoreFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(runtime, /event\.shiftKey && document\.activeElement === first/);
  assert.match(runtime, /event\.preventDefault\(\);\s*last\.focus/);
  assert.match(runtime, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(runtime, /first\.focus\(\{ preventScroll: true \}\)/);
});
