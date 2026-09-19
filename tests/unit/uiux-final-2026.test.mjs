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
  assert.match(memberHtml, /uiux-premium-2026\.css\?v=20260919-uiux2/);
  assert.match(memberHtml, /uiux-premium-2026\.js\?v=20260919-uiux2/);
  assert.match(adminHtml, /uiux-final-2026\.css\?v=20260919-uiux1/);
  assert.match(adminHtml, /uiux-premium-2026\.css\?v=20260919-uiux2/);
  assert.match(adminHtml, /uiux-admin-premium-2026\.css\?v=20260919-uiux2/);
  assert.match(adminHtml, /uiux-admin-premium-2026\.js\?v=20260919-uiux2/);
  assert.match(sw, /putduk-shell-v32/);
  assert.match(sw, /uiux-final-2026\.css\?v=20260919-uiux1/);
  assert.match(sw, /uiux-final-2026\.js\?v=20260919-uiux1/);
  assert.match(sw, /uiux-premium-2026\.css\?v=20260919-uiux2/);
  assert.match(sw, /uiux-premium-2026\.js\?v=20260919-uiux2/);
  assert.match(sw, /uiux-admin-premium-2026\.css\?v=20260919-uiux2/);
  assert.match(sw, /uiux-admin-premium-2026\.js\?v=20260919-uiux2/);
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

test('work matching page explains conditions clearly and keeps business values intact', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  const css = await readRepo('dist', 'assets', 'uiux-final-2026.css');

  assert.match(runtime, /function enhanceMatchingPage/);
  assert.match(runtime, /업무별 시작 금액, 예상 수당, 예상 소요를 비교해 보세요/);
  assert.match(runtime, /업무 시작 금액/);
  assert.match(runtime, /예상 수당/);
  assert.match(runtime, /예상 소요/);
  assert.match(runtime, /참여 가능 \$\{count\}건/);
  assert.match(runtime, /setButtonText\(button, '업무 시작'\)/);
  assert.match(runtime, /setButtonText\(button, '시작 조건 확인'\)/);
  assert.doesNotMatch(runtime, /nodeStake\(|nodePay\(|PAY_BY_STAKE|STAKE_LADDER/);

  assert.match(css, /\.uiux-matching-grid \.uiux-work-card/);
  assert.match(css, /\.uiux-work-card \.node-money[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.uiux-work-card \.node-money \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.uiux-work-card \.node-bottom \.small-button[\s\S]*min-height:\s*44px/);
});

test('work journey feels continuous from order confirmation through settlement without fabricating records', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-final-2026.js');
  const css = await readRepo('dist', 'assets', 'uiux-final-2026.css');

  assert.match(runtime, /const JOURNEY_STEPS = \['오더 확인', '업무 수행', '운영자 검수', '정산 완료'\]/);
  assert.match(runtime, /function buildJourneyStepper/);
  assert.match(runtime, /function enhanceStartConfirm/);
  assert.match(runtime, /function enhanceActiveWork/);
  assert.match(runtime, /function enhanceReviewWait/);
  assert.match(runtime, /function enhanceResultScene/);
  assert.match(runtime, /업무 오더 확인/);
  assert.match(runtime, /업무 제출 완료 · 운영자 검수 대기/);
  assert.match(runtime, /업무 완료 확인서/);
  assert.match(runtime, /업무 제출 확인서/);
  assert.match(runtime, /퍼뜩 업무 기록/);
  assert.match(runtime, /출금 가능 금액에 반영됐어요/);
  assert.doesNotMatch(runtime, /fake|가짜 주문|가짜 영수증|randomUUID|Math\.random\(\).*receipt/i);
  assert.doesNotMatch(runtime, /nodeStake\(|nodePay\(|PAY_BY_STAKE|STAKE_LADDER|submit_deposit|withdrawal_requests/);

  assert.match(css, /\.uiux-journey-stepper/);
  assert.match(css, /\.uiux-work-document/);
  assert.match(css, /\.uiux-document-brand/);
  assert.match(css, /\.uiux-active-work/);
  assert.match(css, /\.uiux-review-wait/);
  assert.match(css, /\.uiux-result-document/);
});

test('premium member layer rebuilds history wallet identity and help wording without finance contracts', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-premium-2026.js');
  assert.match(runtime, /function enhanceHistoryPage/);
  assert.match(runtime, /function enhanceWalletPage/);
  assert.match(runtime, /function enhanceKycModal/);
  assert.match(runtime, /function enhanceFinanceModals/);
  assert.match(runtime, /function enhanceHelp/);
  assert.match(runtime, /업무 내역/);
  assert.match(runtime, /출금 가능 금액/);
  assert.match(runtime, /본인확인 제출/);
  assert.match(runtime, /운영자가 요청 내용을 확인 중이에요/);
  assert.doesNotMatch(runtime, /submit_deposit|withdrawal_requests|admin-phase5|service_role|nodeStake\(|nodePay\(/);
});

test('premium visual system replaces demo-like blur and card styling with restrained SaaS surfaces', async () => {
  const css = await readRepo('dist', 'assets', 'uiux-premium-2026.css');
  assert.match(css, /--premium-surface:\s*#ffffff/);
  assert.match(css, /\.main > div[\s\S]*width:\s*min\(100%, 1440px\)/);
  assert.match(css, /\.sidebar[\s\S]*backdrop-filter:\s*none/);
  assert.match(css, /\.hero-card::after[\s\S]*display:\s*none/);
  assert.match(css, /\.modal-backdrop[\s\S]*backdrop-filter:\s*none/);
  assert.match(css, /\.player-sheet[\s\S]*width:\s*min\(720px, 100%\)/);
  assert.match(css, /\.record-card/);
  assert.match(css, /\.wallet-slot/);
  assert.match(css, /@media \(max-width: 840px\)/);
});

test('premium admin layer clarifies operator terminology and responsive tables without backend contracts', async () => {
  const runtime = await readRepo('dist', 'admin', 'uiux-admin-premium-2026.js');
  const adminCore = await readRepo('dist', 'admin', 'admin.js');
  const phase3 = await readRepo('dist', 'admin', 'phase3-admin-wiring.js');
  const css = await readRepo('dist', 'admin', 'uiux-admin-premium-2026.css');
  assert.match(runtime, /\['전체 현황', '운영 현황'\]/);
  assert.match(runtime, /\['업무 카드 관리', '업무 관리'\]/);
  assert.match(runtime, /function enhanceMembers/);
  assert.match(runtime, /function enhanceAssignmentModal/);
  assert.match(runtime, /function enhanceFinance/);
  assert.match(runtime, /출금 가능 금액/);
  assert.match(runtime, /회원 업무 배정/);
  assert.match(adminCore, /const allNodeRows = api\.adminNodeViews\(\)/);
  assert.match(adminCore, /node\.supply_source === 'operator'/);
  assert.match(adminCore, /brand\.verification_status|brand\.verified/);
  assert.match(adminCore, /현재 배정 가능한 공개 업무 카드가 없습니다/);
  assert.match(adminCore, /async function submitAdminAssignment/);
  assert.match(adminCore, /function invalidateMemberCache/);
  assert.match(adminCore, /function normalizeAdminDateTime/);
  assert.match(adminCore, /visible_from: visibleFrom/);
  assert.match(adminCore, /노출 종료 시간은 시작 이후여야 해요/);
  assert.match(adminCore, /window\.PUTDUK_ADMIN\?\.invalidateMember\?\.\(memberId\)/);
  assert.match(adminCore, /window\.PUTDUK_PHASE31\?\.invalidateMember/);
  assert.match(phase3, /function invalidateMemberCanonicalDetail/);
  assert.match(phase3, /window\.PUTDUK_PHASE31 = \{ invalidateMember/);
  assert.doesNotMatch(runtime, /service_role|admin-phase5|putduk_admin_|withdrawal_requests|member-finance/);
  assert.match(css, /\.uiux-admin-table/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /@media \(max-width: 520px\)/);
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

test('static release verification requires the UIUX FINAL and Premium assets and syntax-checks runtimes', async () => {
  const verify = await readRepo('tooling', 'scripts', 'verify-static.mjs');
  assert.match(verify, /dist\/assets\/uiux-final-2026\.css/);
  assert.match(verify, /dist\/assets\/uiux-final-2026\.js/);
  assert.match(verify, /dist\/assets\/uiux-premium-2026\.css/);
  assert.match(verify, /dist\/assets\/uiux-premium-2026\.js/);
  assert.match(verify, /dist\/admin\/uiux-admin-premium-2026\.css/);
  assert.match(verify, /dist\/admin\/uiux-admin-premium-2026\.js/);
  assert.match(verify, /dist\/admin\/admin\.js/);
  assert.match(verify, /--check[\s\S]*dist\/admin\/admin\.js/);
  assert.match(verify, /--check[\s\S]*uiux-admin-premium-2026\.js/);
  assert.match(verify, /putduk-shell-v32/);
});
