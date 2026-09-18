import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPrivatePreviewAccess, parsePrivatePreviewPath } from '../../src/security/private-file-preview.mjs';

const member = '11111111-1111-4111-8111-111111111111';

test('미리보기는 경로 prefix와 회원 UUID를 검사하고 .. 탈출을 막는다', () => {
  const kyc = parsePrivatePreviewPath(`kyc/${member}/front.jpg`);
  assert.equal(kyc.ok, true);
  assert.equal(kyc.family, 'kyc');
  assert.equal(kyc.memberId, member);
  const finance = parsePrivatePreviewPath(`deposit-proof/${member}/slip.png`);
  assert.equal(finance.ok, true);
  assert.equal(finance.family, 'finance');
  const escape = parsePrivatePreviewPath(`kyc/${member}/../secret.jpg`);
  assert.equal(escape.ok, false);
  assert.equal(escape.status, 400);
});

test('kyc_review는 본인확인 경로만, finance는 입금 증빙만, super_admin은 둘 다', () => {
  const kycPath = `kyc/${member}/front.jpg`;
  const proofPath = `deposit-proof/${member}/slip.png`;
  const legacyKyc = `${member}/kyc/front.jpg`;
  assert.equal(assertPrivatePreviewAccess(kycPath, 'kyc_review', ['kyc_review']).ok, true);
  assert.equal(assertPrivatePreviewAccess(legacyKyc, 'kyc', ['kyc_review']).ok, true);
  assert.equal(assertPrivatePreviewAccess(proofPath, 'kyc_review', ['kyc_review']).ok, false);
  assert.equal(assertPrivatePreviewAccess(proofPath, 'finance', ['finance']).ok, true);
  assert.equal(assertPrivatePreviewAccess(kycPath, 'finance', ['finance']).ok, false);
  assert.equal(assertPrivatePreviewAccess(kycPath, 'finance', ['super_admin']).ok, true);
  assert.equal(assertPrivatePreviewAccess(proofPath, 'kyc', ['super_admin']).ok, true);
  const mismatch = assertPrivatePreviewAccess(kycPath, 'finance', ['kyc_review']);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, 403);
  assert.match(mismatch.message, /용도와 경로/);
});
