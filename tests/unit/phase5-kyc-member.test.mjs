import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';
import {
  validateKycUploadFile,
  isKycBusyForm,
  setKycFormBusy,
  isKycPathForDocumentKind,
  runGuardedKycSubmit
} from '../../src/security/kyc-upload.mjs';

const userId = '11111111-1111-4111-8111-111111111111';

test('KYC 클라이언트 검증: MIME·크기·셀카 PDF 거절', () => {
  const okFront = validateKycUploadFile({ type: 'image/jpeg', size: 1024 }, 'identity_front');
  assert.equal(okFront.ok, true);
  const pdfFront = validateKycUploadFile({ type: 'application/pdf', size: 1024 }, 'identity_front');
  assert.equal(pdfFront.ok, true);
  const pdfBack = validateKycUploadFile({ type: 'application/pdf', size: 1024 }, 'identity_back');
  assert.equal(pdfBack.ok, true);
  const big = validateKycUploadFile({ type: 'image/png', size: 11 * 1024 * 1024 }, 'identity_back');
  assert.equal(big.ok, false);
  const pdfSelfie = validateKycUploadFile({ type: 'application/pdf', size: 1000 }, 'selfie');
  assert.equal(pdfSelfie.ok, false);
  assert.match(pdfSelfie.message, /셀카/);
});

test('KYC path는 document kind segment와 bind된다', () => {
  const frontPath = `kyc/${userId}/identity_front/uuid-front.jpg`;
  const backPath = `kyc/${userId}/identity_back/uuid-back.pdf`;
  const selfiePath = `kyc/${userId}/selfie/uuid-selfie.jpg`;
  assert.equal(isKycPathForDocumentKind(userId, frontPath, 'identity_front'), true);
  assert.equal(isKycPathForDocumentKind(userId, backPath, 'identity_back'), true);
  assert.equal(isKycPathForDocumentKind(userId, selfiePath, 'selfie'), true);
  assert.equal(isKycPathForDocumentKind(userId, frontPath, 'selfie'), false);
  assert.equal(isKycPathForDocumentKind(userId, `kyc/${userId}/legacy.jpg`, 'identity_front'), false);
});

test('KYC busy guard는 중복 제출을 막고 finally에서 복구한다', () => {
  const form = { dataset: {}, querySelector() { return this.button; }, button: { dataset: {}, disabled: false, textContent: '검수 요청' } };
  assert.equal(isKycBusyForm(form), false);
  setKycFormBusy(form, true);
  assert.equal(isKycBusyForm(form), true);
  assert.equal(form.button.disabled, true);
  assert.match(form.button.textContent, /올리는 중/);
  setKycFormBusy(form, false);
  assert.equal(isKycBusyForm(form), false);
  assert.equal(form.button.disabled, false);
});

test('동시 KYC submit 두 번 → submit_kyc 1회', async () => {
  const form = { dataset: {}, querySelector() { return this.button; }, button: { dataset: {}, disabled: false, textContent: '검수 요청' } };
  let submitCalls = 0;
  let gate = null;
  const uploadKind = async (kind) => {
    if (kind === 'identity_front') {
      await new Promise((resolve) => { gate = resolve; });
    }
    return `kyc/${userId}/${kind}/file.jpg`;
  };
  const submitKyc = async () => { submitCalls += 1; };
  const first = runGuardedKycSubmit(form, { uploadKind, submitKyc });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = runGuardedKycSubmit(form, { uploadKind, submitKyc });
  gate?.();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok || b.ok, true);
  assert.equal(submitCalls, 1);
  assert.equal(a.skipped || b.skipped, true);
});

test('회원 KYC는 signed upload 후 실제 path로 submit_kyc 1회만 호출한다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /memberFinanceRequest\('request_upload'/);
  assert.match(appJs, /purpose:\s*'kyc'/);
  assert.match(appJs, /document_kind:\s*documentKind/);
  assert.match(appJs, /'identity_front'/);
  assert.match(appJs, /uploadToSignedUrl/);
  assert.match(appJs, /memberFinanceRequest\('submit_kyc'/);
  assert.match(appJs, /front_path:\s*frontPath/);
  assert.match(appJs, /back_path:\s*backPath/);
  assert.match(appJs, /selfie_path:\s*selfiePath/);
  assert.match(appJs, /form\?\.dataset\?\.kycBusy === '1'/);
  assert.doesNotMatch(appJs, /has_front|has_back|has_selfie/);
  assert.doesNotMatch(appJs, /edgeRequest\('submit_kyc'/);
  assert.doesNotMatch(appJs, /createSignedUrl|getPublicUrl/);
});

test('한 파일 업로드 실패 시 submit_kyc가 호출되지 않는다', async () => {
  const form = { dataset: {}, querySelector() { return this.button; }, button: { dataset: {}, disabled: false, textContent: '검수 요청' } };
  let submitCalls = 0;
  const result = await runGuardedKycSubmit(form, {
    uploadKind: async (kind) => {
      if (kind === 'identity_back') throw new Error('upload fail');
      return `kyc/${userId}/${kind}/file.jpg`;
    },
    submitKyc: async () => { submitCalls += 1; }
  });
  assert.equal(result.ok, false);
  assert.equal(submitCalls, 0);
  assert.equal(result.uploadCalls, 1);
});

test('request_upload KYC path는 document kind segment를 포함한다', async () => {
  const edge = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  assert.match(edge, /\$\{documentKind\}\/\$\{crypto\.randomUUID\(\)\}/);
  assert.match(edge, /isKycPathForDocumentKind/);
});

test('submit_kyc RPC는 review_pending을 profiles에 기록한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260919120000_putduk_phase5_kyc_payout_security.sql');
  assert.match(migration, /kyc_status = 'review_pending'/);
  assert.match(migration, /return 'review_pending'/);
  assert.match(migration, /split_part\(v_front, '\/', 3\) <> 'identity_front'/);
  assert.match(migration, /split_part\(v_selfie, '\/', 3\) <> 'selfie'/);
});
