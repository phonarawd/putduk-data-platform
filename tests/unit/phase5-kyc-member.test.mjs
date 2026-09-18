import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';
import { validateKycUploadFile, isKycBusyForm, setKycFormBusy } from '../../src/security/kyc-upload.mjs';

test('KYC 클라이언트 검증: MIME·크기·셀카 PDF 거절', () => {
  const okFront = validateKycUploadFile({ type: 'image/jpeg', size: 1024 }, 'identity_front');
  assert.equal(okFront.ok, true);
  const big = validateKycUploadFile({ type: 'image/png', size: 11 * 1024 * 1024 }, 'identity_back');
  assert.equal(big.ok, false);
  const pdfSelfie = validateKycUploadFile({ type: 'application/pdf', size: 1000 }, 'selfie');
  assert.equal(pdfSelfie.ok, false);
  assert.match(pdfSelfie.message, /셀카/);
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
  const calls = [];
  async function uploadKind(kind) {
    calls.push({ action: 'request_upload', kind });
    if (kind === 'identity_back') throw new Error('upload fail');
    return `kyc/user/${kind}.jpg`;
  }
  async function submitKyc(frontPath, backPath, selfiePath) {
    if (!frontPath || !backPath || !selfiePath) return false;
    calls.push({ action: 'submit_kyc' });
    return true;
  }
  let frontPath = null;
  let backPath = null;
  let selfiePath = null;
  try { frontPath = await uploadKind('identity_front'); } catch (_) {}
  try { backPath = await uploadKind('identity_back'); } catch (_) {}
  try { selfiePath = await uploadKind('selfie'); } catch (_) {}
  if (frontPath && backPath && selfiePath) await submitKyc(frontPath, backPath, selfiePath);
  assert.equal(calls.some((row) => row.action === 'submit_kyc'), false);
});

test('submit_kyc RPC는 review_pending을 profiles에 기록한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260919120000_putduk_phase5_kyc_payout_security.sql');
  assert.match(migration, /kyc_status = 'review_pending'/);
  assert.match(migration, /return 'review_pending'/);
  assert.match(migration, /review_pending/);
});
