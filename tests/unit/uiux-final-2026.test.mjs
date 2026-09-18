import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('UIUX FINAL 2026 assets are wired into member/admin shells and service worker', async () => {
  const [memberHtml, adminHtml, sw] = await Promise.all([
    readRepo('dist', 'index.html'),
    readRepo('dist', 'admin', 'index.html'),
    readRepo('dist', 'sw.js')
  ]);

  assert.match(memberHtml, /uiux-final-2026\.css\?v=20260919-uiux1/);
  assert.match(memberHtml, /uiux-final-2026\.js\?v=20260919-uiux1/);
  assert.match(adminHtml, /uiux-final-2026\.css\?v=20260919-uiux1/);
  assert.match(adminHtml, /uiux-final-2026\.js\?v=20260919-uiux1/);
  assert.match(sw, /putduk-shell-v24/);
  assert.match(sw, /uiux-final-2026\.css\?v=20260919-uiux1/);
  assert.match(sw, /uiux-final-2026\.js\?v=20260919-uiux1/);
});

test('member-facing 라인 찾기 copy normalizes to 업무 매칭 without renaming internal line taxonomy', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  assert.match(runtime, /\['라인 찾기', '업무 매칭'\]/);
  assert.match(runtime, /root\.dataset\.mode === 'admin'/);
  assert.match(runtime, /function ensureMatchingTab/);
  assert.match(runtime, /matching\.dataset\.nav = 'nodes'/);
  assert.doesNotMatch(runtime, /split\('라인'\)/);
});

test('Korean typography, touch targets, six-tab mobile nav and reduced-motion safeguards are present', async () => {
  const css = await readRepo('dist', 'assets', 'uiux-final-2026.css');
  assert.match(css, /--uiux-letter-body:\s*-0\.012em/);
  assert.match(css, /--uiux-letter-title:\s*-0\.032em/);
  assert.match(css, /--uiux-touch:\s*44px/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test('member boot copy is phrased around work rather than internal line terminology', async () => {
  const memberHtml = await readRepo('dist', 'index.html');
  assert.match(memberHtml, /오늘 참여할 수 있는 업무를 확인하고 있어요/);
  assert.doesNotMatch(memberHtml, /오늘 라인 자리를 확인하고 있어요/);
});
