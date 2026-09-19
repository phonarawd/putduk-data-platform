import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('member shell wires premium auth/legal assets and service worker v32 caches them', async () => {
  const [memberHtml, sw] = await Promise.all([
    readRepo('dist', 'index.html'),
    readRepo('dist', 'sw.js')
  ]);

  assert.match(memberHtml, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(memberHtml, /uiux-auth-2026\.js\?v=20260919-uiux4/);
  assert.match(memberHtml, /uiux-legal-2026\.css\?v=20260919-uiux8/);
  assert.match(memberHtml, /uiux-legal-2026\.js\?v=20260919-uiux8/);
  assert.match(memberHtml, /uiux-compliance-2026\.js\?v=20260919-uiux8/);
  assert.match(sw, /putduk-shell-v32/);
  assert.match(sw, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(sw, /uiux-auth-2026\.js\?v=20260919-uiux4/);
  assert.match(sw, /uiux-legal-2026\.css\?v=20260919-uiux8/);
  assert.match(sw, /uiux-legal-2026\.js\?v=20260919-uiux8/);
  assert.match(sw, /uiux-compliance-2026\.js\?v=20260919-uiux8/);
  assert.match(sw, /uiux-growth-2026\.css\?v=20260919-uiux3/);
  assert.match(sw, /uiux-growth-2026\.js\?v=20260919-uiux3/);

  const authScriptIdx = memberHtml.indexOf('uiux-auth-2026.js');
  const legalScriptIdx = memberHtml.indexOf('uiux-legal-2026.js');
  assert.ok(authScriptIdx >= 0 && legalScriptIdx > authScriptIdx, 'auth runtime must load before final legal runtime');
});

test('auth UX exposes required labels, password visibility, password validation and separate consent items', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-auth-2026.js');

  assert.match(runtime, /uiux-field-badge/);
  assert.match(runtime, /control\.required \? '필수' : '선택'/);
  assert.match(runtime, /data-uiux-password-target/);
  assert.match(runtime, /비밀번호 보기/);
  assert.match(runtime, /비밀번호 숨기기/);
  assert.match(runtime, /8자 이상 입력해 주세요/);
  assert.match(runtime, /비밀번호가 일치하지 않습니다/);
  assert.match(runtime, /setCustomValidity/);
  assert.match(runtime, /signupAgreeAll/);
  assert.match(runtime, /signupPrivacy/);
  assert.match(runtime, /이용약관 동의/);
  assert.match(runtime, /개인정보 수집·이용 동의/);
});

test('signup consent evidence uses the FINAL 2026-09-19 legal version', async () => {
  const app = await readRepo('dist', 'assets', 'app.js');

  assert.match(app, /terms_accepted:\s*termsAccepted/);
  assert.match(app, /privacy_accepted:\s*privacyAccepted/);
  assert.match(app, /terms_version:\s*['"]2026-09-19['"]/);
  assert.match(app, /privacy_version:\s*['"]2026-09-19['"]/);
  assert.match(app, /!termsAccepted\s*\|\|\s*!privacyAccepted/);
  assert.match(app, /marketing_opt_in:/);
  assert.doesNotMatch(app, /terms_version:\s*['"]2026-09-16['"]/);
  assert.doesNotMatch(app, /privacy_version:\s*['"]2026-09-16['"]/);
});

test('auth runtime delegates legal document ownership to uiux-legal-2026.js', async () => {
  const authRuntime = await readRepo('dist', 'assets', 'uiux-auth-2026.js');

  assert.doesNotMatch(authRuntime, /2026\.09\.16/);
  assert.doesNotMatch(authRuntime, /const LEGAL_DOCUMENTS/);
  assert.doesNotMatch(authRuntime, /function openLegalSheet/);
  assert.doesNotMatch(authRuntime, /function closeLegalSheet/);
  assert.match(authRuntime, /dataset\.uiuxLegal/);
  assert.match(authRuntime, /signupAgreeAll/);
  assert.match(authRuntime, /signupPrivacy/);
  assert.match(authRuntime, /이용약관 동의/);
  assert.match(authRuntime, /개인정보 수집·이용 동의/);
});

test('legal UX presents structured member-facing legal documents and marketing choice', async () => {
  const [legal, authCss, legalCss] = await Promise.all([
    readRepo('dist', 'assets', 'uiux-legal-2026.js'),
    readRepo('dist', 'assets', 'uiux-auth-2026.css'),
    readRepo('dist', 'assets', 'uiux-legal-2026.css')
  ]);

  assert.match(legal, /const VERSION = ['"]2026\.09\.19['"]/);
  assert.match(legal, /퍼뜩 이용약관/);
  assert.match(legal, /개인정보 수집·이용 및 처리 안내/);
  assert.match(legal, /광고성 정보 수신 동의/);
  assert.match(legal, /업무 매칭과 오더/);
  assert.match(legal, /검수와 수당 확정/);
  assert.match(legal, /주민등록번호/);
  assert.match(legal, /오후 9시/);
  assert.match(legal, /개인정보 보호책임자/);
  assert.match(legal, /혜택·이벤트 등 광고성 정보 수신/);
  assert.match(legal, /필수 서비스 알림은 광고성 수신 동의와 구분/);
  assert.match(legal, /uiux-legal-final/);
  assert.match(authCss, /\.uiux-legal-sheet/);
  assert.match(authCss, /@media \(max-width: 430px\)[\s\S]*min-height:\s*100dvh/);
  assert.match(legalCss, /\.uiux-legal-section-final/);
  assert.match(legalCss, /\.uiux-agreement-service-note/);
  assert.match(legalCss, /\.uiux-business-certificate/);
  assert.match(legalCss, /\.uiux-biz-cert-table/);
});

test('KYC compliance guidance tells members to mask unnecessary identity numbers and keeps legal docs accessible', async () => {
  const compliance = await readRepo('dist', 'assets', 'uiux-compliance-2026.js');
  assert.match(compliance, /신분증 제출 전 확인해 주세요/);
  assert.match(compliance, /주민등록번호 뒷자리/);
  assert.match(compliance, /필요하지 않은 정보는 가린 뒤 제출/);
  assert.match(compliance, /uiux-legal-access/);
  assert.match(compliance, /uiux-auth-legal-access/);
  assert.match(compliance, /data-uiux-legal="business"/);
  assert.match(compliance, /사업자정보/);
  assert.match(compliance, /uiux-business-info-card/);
  assert.match(compliance, /data-uiux-business-certificate/);
  assert.match(compliance, /사업자정보 확인서 보기/);
  assert.match(compliance, /이용약관/);
  assert.match(compliance, /개인정보 처리 안내/);
});

test('legal runtime publishes GOGOX HOLDINGS LIMITED business operator info', async () => {
  const legal = await readRepo('dist', 'assets', 'uiux-legal-2026.js');
  assert.match(legal, /const BUSINESS_INFO = \{/);
  assert.match(legal, /GOGOX HOLDINGS LIMITED/);
  assert.match(legal, /representative: '퍼뜩'/);
  assert.match(legal, /help@hiptk\.app/);
  assert.match(legal, /confirmationNumber: 'PDK-BIZ-20260919'/);
  assert.match(legal, /function openBusinessCertificate/);
  assert.match(legal, /uiux-business-certificate/);
  assert.match(legal, /사업자정보 확인서/);\n  assert.doesNotMatch(legal, /사업자등록증/);
  assert.match(legal, /business:\s*\{/);
  assert.match(legal, /title: '사업자정보'/);
  assert.doesNotMatch(legal, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(legal, /홍콩/);
});

test('auth/legal overlays do not change finance, payout or work contracts', async () => {
  const [authRuntime, legalRuntime, complianceRuntime] = await Promise.all([
    readRepo('dist', 'assets', 'uiux-auth-2026.js'),
    readRepo('dist', 'assets', 'uiux-legal-2026.js'),
    readRepo('dist', 'assets', 'uiux-compliance-2026.js')
  ]);
  for (const runtime of [authRuntime, legalRuntime, complianceRuntime]) {
    assert.doesNotMatch(runtime, /member-finance|admin-phase5|submit_deposit|withdrawal_requests|nodeStake\(|nodePay\(/);
  }
});
