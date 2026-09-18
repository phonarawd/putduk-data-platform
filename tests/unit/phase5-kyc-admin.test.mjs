import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';
import { assertPrivatePreviewAccess } from '../../src/security/private-file-preview.mjs';

const member = '11111111-1111-4111-8111-111111111111';

test('kyc_review만 KYC preview 가능, finance-only는 KYC preview 불가', () => {
  const kycPath = `kyc/${member}/identity_front/front.jpg`;
  assert.equal(assertPrivatePreviewAccess(kycPath, 'kyc', ['kyc_review']).ok, true);
  assert.equal(assertPrivatePreviewAccess(kycPath, 'kyc', ['finance']).ok, false);
  assert.equal(assertPrivatePreviewAccess(kycPath, 'kyc', ['super_admin']).ok, true);
});

test('admin KYC는 preview_kyc_document·review_kyc·본인확인 탭을 사용한다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminJs, /label: '본인확인'/);
  assert.match(adminJs, /preview_kyc_document/);
  assert.match(adminJs, /review_kyc/);
  assert.match(adminJs, /data-action="kyc-preview"/);
  assert.match(adminJs, /data-action="kyc-approve"/);
  assert.match(adminJs, /data-action="kyc-reject"/);
  assert.match(adminJs, /close-kyc-preview/);
  assert.match(adminOps, /KYC preview/);
  assert.match(adminOps, /KYC approved/);
  assert.match(adminOps, /KYC rejected/);
  assert.match(adminOps, /previewKycDocument/);
});

test('admin KYC list는 kyc_documents.updated_at을 SELECT하지 않는다', async () => {
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const listBlock = adminOps.slice(adminOps.indexOf('export async function listKyc'), adminOps.indexOf('export async function reviewKyc'));
  const kycSelect = listBlock.match(/from\("kyc_documents"\)[\s\S]*?select\("([^"]+)"\)/)?.[1] || '';
  assert.match(kycSelect, /created_at/);
  assert.doesNotMatch(kycSelect, /updated_at/);
});

test('admin KYC preview는 PDF 링크·preview_type을 지원한다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminOps, /preview_type/);
  assert.match(adminJs, /preview_type/);
  assert.match(adminJs, /PDF 열기/);
  assert.match(adminJs, /target="_blank"/);
  assert.match(adminJs, /rel="noopener noreferrer"/);
});

test('반려 시 reason 필수는 RPC에 남아 있다', async () => {
  const rpc = await readRepo('supabase', 'migrations', '20260916233710_putduk_ops_finance_rpc_member.sql');
  assert.match(rpc, /v_decision = 'rejected' and v_reason is null/);
});

test('admin preview·reveal은 saveState/localStorage에 저장하지 않는다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const appJs = await readRepo('dist', 'assets', 'app.js');
  assert.match(adminJs, /adminKycPreview/);
  assert.match(adminJs, /close-kyc-preview/);
  assert.doesNotMatch(adminJs, /localStorage.*signed_url|sessionStorage.*signed_url/);
  assert.match(appJs, /adminKycPreview,\s*adminWithdrawalReveal/);
  assert.match(appJs, /state\.adminKycPreview = null/);
  assert.match(appJs, /state\.adminWithdrawalReveal = null/);

  assert.match(appJs, /sanitizeAdminFinanceForStorage/);
  assert.match(appJs, /scrubPersistedStatePayload/);
  assert.match(appJs, /scrubLegacyAdminFinanceStorage/);

  const saveBlock = appJs.slice(appJs.indexOf('function saveState()'), appJs.indexOf('function switchToUserState'));
  for (const needle of ['adminKycPreview', 'adminWithdrawalReveal', 'signed_url', 'account_holder', 'account_number', 'usdt_address']) {
    assert.doesNotMatch(saveBlock, new RegExp(`safe[^;]*${needle}`));
  }

  const sample = {
    theme: 'dark',
    adminKycPreview: { signed_url: 'https://secret', kind: 'identity_front' },
    adminWithdrawalReveal: { account_holder: '홍길동', account_number: '1234567890', usdt_address: '0xabc' },
    adminFinance: {
      deposits: [],
      withdrawals: [],
      kyc: [],
      destinations: [{ id: '1', account_holder: '홍길동', bank_name: '국민은행' }]
    },
    wallet: { available: 1000 }
  };
  const {
    toast, modal, modalPayload, adminMemberDetail, adminKycPreview, adminWithdrawalReveal,
    depositReveal, depositRevealExpiresAt, depositRevealToken, ...rest
  } = sample;
  const safe = { ...rest, toast: null, modal: null, modalPayload: null, adminMemberDetail: null, depositReveal: null, depositRevealExpiresAt: null, depositRevealToken: null };
  if (safe.adminFinance) safe.adminFinance = { ...safe.adminFinance, destinations: [] };
  const serialized = JSON.stringify(safe);
  for (const forbidden of ['signed_url', 'account_holder', 'account_number', 'usdt_address', 'adminKycPreview', 'adminWithdrawalReveal', '국민은행', '홍길동']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  assert.deepEqual(JSON.parse(serialized).adminFinance.destinations, []);
});

test('theme toggle saveState 트리거 후에도 지급정보 plaintext가 localStorage payload에 없다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app.js');
  assert.match(appJs, /data-theme-toggle[\s\S]*saveState\(\)/);
  const state = {
    theme: 'light',
    adminWithdrawalReveal: { account_holder: '테스트', account_number: '9876543210', usdt_address: 'T123' },
    wallet: { available: 5000 }
  };
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  const {
    adminKycPreview, adminWithdrawalReveal, toast, modal, modalPayload, adminMemberDetail,
    depositReveal, depositRevealExpiresAt, depositRevealToken, ...rest
  } = state;
  const safe = { ...rest, toast: null, modal: null, modalPayload: null, adminMemberDetail: null, depositReveal: null, depositRevealExpiresAt: null, depositRevealToken: null };
  const payload = JSON.stringify(safe);
  assert.doesNotMatch(payload, /account_holder|account_number|usdt_address|signed_url/);
});
