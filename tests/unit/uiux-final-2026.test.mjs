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

test('member-facing work copy normalizes to 업무 매칭 without renaming generic internal line taxonomy', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  assert.match(runtime, /\['라인 찾기', '업무 매칭'\]/);
  assert.match(runtime, /\['오늘 라인', '오늘 업무'\]/);
  assert.match(runtime, /\['라인 더 보기', '업무 더 보기'\]/);
  assert.match(runtime, /root\.dataset\.mode === 'admin'/);
  assert.match(runtime, /function ensureMatchingTab/);
  assert.match(runtime, /matching\.dataset\.nav = 'nodes'/);
  assert.doesNotMatch(runtime, /split\('라인'\)/);
});

test('member dashboard hero uses clear matching-first Korean copy and scoped metric labels', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  assert.match(runtime, /function enhanceDashboardHero/);
  assert.match(runtime, /지금 참여할 수 있는 업무/);
  assert.match(runtime, /내 조건에 맞는 업무를/);
  assert.match(runtime, /확인해 보세요\./);
  assert.match(runtime, /현재 참여 가능한 업무와 필요한 조건을 한눈에 확인하고/);
  assert.match(runtime, /업무 매칭 시작/);
  assert.match(runtime, /\['오늘 업무', '매칭 가능 업무'\]/);
  assert.match(runtime, /\['검수 완료', '완료한 업무'\]/);
  assert.match(runtime, /\['오늘 작업 가능', '오늘 남은 횟수'\]/);
  assert.match(runtime, /\['근무 상태', '현재 상태'\]/);
  assert.match(runtime, /로그인 후 확인/);
  assert.match(runtime, /next === '매칭 가능 업무'[\s\S]*unit\.textContent = '건'/);

  const copyStart = runtime.indexOf('const COPY_REPLACEMENTS');
  const metricStart = runtime.indexOf('const DASHBOARD_METRIC_LABELS');
  assert.ok(copyStart >= 0 && metricStart > copyStart);
  const copySection = runtime.slice(copyStart, metricStart);
  assert.doesNotMatch(copySection, /\['검수 완료', '완료한 업무'\]/);
});

test('member-facing finance copy follows Korean spacing without changing finance contracts', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  assert.match(runtime, /\['업무잔액', '업무 잔액'\]/);
  assert.match(runtime, /\['출금가능', '출금 가능'\]/);
  assert.match(runtime, /\['신청하고 처리 중으로', '출금 신청'\]/);
  assert.doesNotMatch(runtime, /member-finance|submit_deposit|withdrawal_requests|admin-phase5/);
});

test('Korean typography, touch targets, six-tab mobile nav and reduced-motion safeguards are present', async () => {
  const css = await readRepo('dist', 'assets', 'uiux-final-2026.css');
  assert.match(css, /--uiux-letter-body:\s*-0\.012em/);
  assert.match(css, /--uiux-letter-title:\s*-0\.032em/);
  assert.match(css, /--uiux-touch:\s*44px/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.hero-card \.hero-metrics[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 840px\)[\s\S]*\.hero-card \.hero-metrics \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test('member boot copy is phrased around work rather than internal line terminology', async () => {
  const memberHtml = await readRepo('dist', 'index.html');
  assert.match(memberHtml, /오늘 참여할 수 있는 업무를 확인하고 있어요/);
  assert.doesNotMatch(memberHtml, /오늘 라인 자리를 확인하고 있어요/);
});

test('static release verification requires the UIUX FINAL assets and syntax-checks the runtime', async () => {
  const verify = await readRepo('tooling', 'scripts', 'verify-static.mjs');
  assert.match(verify, /dist\/assets\/uiux-final-2026\.css/);
  assert.match(verify, /dist\/assets\/uiux-final-2026\.js/);
  assert.match(verify, /--check[\s\S]*uiux-final-2026\.js/);
});
