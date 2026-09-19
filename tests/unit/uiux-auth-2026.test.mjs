import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('member shell wires premium auth assets and service worker v28 caches them', async () => {
  const [memberHtml, sw] = await Promise.all([
    readRepo('dist', 'index.html'),
    readRepo('dist', 'sw.js')
  ]);

  assert.match(memberHtml, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(memberHtml, /uiux-auth-2026\.js\?v=20260919-uiux4/);
  assert.match(sw, /putduk-shell-v28/);
  assert.match(sw, /uiux-auth-2026\.css\?v=20260919-uiux4/);
  assert.match(sw, /uiux-auth-2026\.js\?v=20260919-uiux4/);
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

test('legal UX keeps the currently published terms text and presents it in a structured sheet', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-auth-2026.js');
  const css = await readRepo('dist', 'assets', 'uiux-auth-2026.css');

  assert.match(runtime, /LEGAL_DOCUMENTS/);
  assert.match(runtime, /퍼뜩 이용약관/);
  assert.match(runtime, /개인정보 수집·이용 안내/);
  assert.match(runtime, /서비스 이용/);
  assert.match(runtime, /보상 기준/);
  assert.match(runtime, /계정 보호/);
  assert.match(runtime, /수집 항목/);
  assert.match(runtime, /이용 목적/);
  assert.match(runtime, /보관 및 열람/);
  assert.match(runtime, /현재 서비스에 게시된 원문/);
  assert.match(css, /\.uiux-legal-sheet/);
  assert.match(css, /\.uiux-legal-nav/);
  assert.match(css, /\.uiux-legal-section/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*min-height:\s*100dvh/);
});

test('auth overlay does not change Supabase, finance, payout or work contracts', async () => {
  const runtime = await readRepo('dist', 'assets', 'uiux-auth-2026.js');
  assert.doesNotMatch(runtime, /supabase|member-finance|admin-phase5|submit_deposit|withdrawal_requests|nodeStake\(|nodePay\(/);
});
