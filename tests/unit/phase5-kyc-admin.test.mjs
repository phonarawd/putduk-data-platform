import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';
import { assertPrivatePreviewAccess } from '../../src/security/private-file-preview.mjs';

const member = '11111111-1111-4111-8111-111111111111';

test('kyc_review만 KYC preview 가능, finance-only는 KYC preview 불가', () => {
  const kycPath = `kyc/${member}/front.jpg`;
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

test('반려 시 reason 필수는 RPC에 남아 있다', async () => {
  const rpc = await readRepo('supabase', 'migrations', '20260916233710_putduk_ops_finance_rpc_member.sql');
  assert.match(rpc, /v_decision = 'rejected' and v_reason is null/);
});

test('admin preview는 storage path를 영구 state에 저장하지 않는다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const appJs = await readRepo('dist', 'assets', 'app.js');
  assert.match(adminJs, /adminKycPreview/);
  assert.match(adminJs, /close-kyc-preview/);
  assert.doesNotMatch(adminJs, /localStorage.*signed_url|sessionStorage.*signed_url/);
  assert.match(appJs, /state\.adminKycPreview = null/);
});
