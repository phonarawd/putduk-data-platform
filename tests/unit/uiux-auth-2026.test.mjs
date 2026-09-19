import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('member shell wires premium auth/legal assets and service worker v29 caches them', async () => {
  const [memberHtml, sw] = await Promise.all([
    readRepo('dist', 'index.html'),
    readRepo('dist', 'sw.js')
  ]);

  assert.match(memberHtml, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(memberHtml, /uiux-auth-2026\.js\?v=20260919-uiux4/);
  assert.match(memberHtml, /uiux-legal-2026\.css\?v=20260919-uiux5/);
  assert.match(memberHtml, /uiux-legal-2026\.js\?v=20260919-uiux5/);
  assert.match(memberHtml, /uiux-compliance-2026\.js\?v=20260919-uiux5/);
  assert.match(sw, /putduk-shell-v29/);
  assert.match(sw, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(sw, /uiux-auth-2026\.js\?v=20260919-uiux4/);
  assert.match(sw, /uiux-legal-2026\.css\?v=20260919-uiux5/);
  assert.match(sw, /uiux-legal-2026\.js\?v=20260919-uiux5/);
  assert.match(sw, /uiux-compliance-2026\.js\?v=20260919-uiux5/);
  assert.match(sw, /uiux-growth-2026\.css\?v=20260919-uiux3/);
  assert.match(sw, /uiux-growth-2026\.js\?v=20260919-uiux3/);
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
  assert.match(runtime, /업무 상태 및 서비스 안내 알림 수신/);
});

test('legal UX presents structured member-facing legal documents', async () => {
  const [legal, authCss] = await Promise.all([
    readRepo('dist', 'assets', 'uiux-legal-2026.js'),
    readRepo('dist', 'assets', 'uiux-auth-2026.css')
  ]);

  assert.match(legal, /퍼뜩 이용약관/);
  assert.match(legal, /개인정보 수집·이용 및 처리 안내/);
  assert.match(legal, /광고성 정보 수신 동의/);
  assert.match(legal, /업무 매칭과 오더/);
  assert.match(legal, /검수와 수당 확정/);
  assert.match(legal, /주민등록번호/);
  assert.match(legal, /오후 9시/);
  assert.match(legal, /개인정보 보호책임자/);
  assert.match(legal, /uiux-legal-final/);
  assert.match(authCss, /\.uiux-legal-sheet/);
  assert.match(authCss, /@media \(max-width: 430px\)[\s\S]*min-height:\s*100dvh/);
});

test('KYC compliance guidance tells members to mask unnecessary identity numbers', async () => {
  const compliance = await readRepo('dist', 'assets', 'uiux-compliance-2026.js');
  assert.match(compliance, /신분증 제출 전 확인해 주세요/);
  assert.match(compliance, /주민등록번호 뒷자리/);
  assert.match(compliance, /필요하지 않은 정보는 가린 뒤 제출/);
});

test('auth/legal overlays do not change Supabase, finance, payout or work contracts', async () => {
  const [authRuntime, legalRuntime, complianceRuntime] = await Promise.all([
    readRepo('dist', 'assets', 'uiux-auth-2026.js'),
    readRepo('dist', 'assets', 'uiux-legal-2026.js'),
    readRepo('dist', 'assets', 'uiux-compliance-2026.js')
  ]);
  for (const runtime of [authRuntime, legalRuntime, complianceRuntime]) {
    assert.doesNotMatch(runtime, /member-finance|admin-phase5|submit_deposit|withdrawal_requests|nodeStake\(|nodePay\(/);
  }
});
