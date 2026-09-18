import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayoutSecret, decryptPayoutSecret, isPayoutCiphertext } from '../../src/security/payout-crypto.mjs';

test('지급정보 원문은 암호문과 다르고 같은 키로 복호화된다', async () => {
  const secret = 'unit-test-payout-secret';
  const plain = 'TEXAMPLEADDRESSFORUNITTESTONLY12';
  const cipher = await encryptPayoutSecret(plain, secret);
  assert.equal(isPayoutCiphertext(cipher), true);
  assert.equal(String(cipher).includes(plain), false);
  assert.equal(await decryptPayoutSecret(cipher, secret), plain);
});

test('예전 평문 행은 키가 있어도 그대로 읽고, 빈 값은 저장하지 않는다', async () => {
  const secret = 'unit-test-payout-secret';
  assert.equal(await decryptPayoutSecret('110-123-456', secret), '110-123-456');
  assert.equal(await encryptPayoutSecret('   ', secret), null);
  const already = await encryptPayoutSecret('hello', secret);
  assert.equal(await encryptPayoutSecret(already, secret), already);
});

test('저장 키가 없으면 평문으로 저장하지 않고 중단한다', async () => {
  await assert.rejects(
    () => encryptPayoutSecret('110-123-456', ''),
    (error) => error && error.code === 'PAYOUT_SECRET_MISSING' && error.status === 503
  );
});
