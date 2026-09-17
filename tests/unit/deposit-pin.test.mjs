import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRevealToken,
  challengePayload,
  DEPOSIT_INFO_PIN_REQUIRED,
  DEPOSIT_PIN_POLICY,
  hashPin,
  isPinLocked,
  isSixDigitPin,
  PIN_SCOPES,
  registerPinFailure,
  stripDepositSecrets,
  verifyPin
} from '../../src/security/deposit-pin.mjs';
import {
  assertUsdtDepositPolicy,
  bumpDestinationVersion,
  USDT_DEPOSIT_ADDRESS_MODE,
  usdtDepositTrackable
} from '../../src/wallet/usdt-deposit-policy.mjs';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

test('보안 PIN은 scrypt 해시이고 평문과 다르다', () => {
  const pin = '147258';
  const stored = hashPin(pin);
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(stored.includes(pin), false);
  assert.equal(verifyPin(pin, stored), true);
  assert.equal(verifyPin('000000', stored), false);
  assert.equal(isSixDigitPin('147258'), true);
  assert.equal(isSixDigitPin('14725'), false);
});

test('5회 실패하면 15분 잠그고 공개 토큰은 사용자·scope·버전에 묶인다', () => {
  let fail = { failedAttempts: 0 };
  for (let i = 0; i < 4; i += 1) fail = registerPinFailure(fail.failedAttempts);
  assert.equal(fail.locked, false);
  fail = registerPinFailure(fail.failedAttempts);
  assert.equal(fail.locked, true);
  assert.equal(DEPOSIT_PIN_POLICY.lockSeconds, 15 * 60);
  assert.ok(isPinLocked(fail.lockedUntil));
  const ok = assertRevealToken({
    user_id: 'u1',
    scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
    catalog_version: 3,
    expires_at: new Date(Date.now() + 60_000)
  }, { userId: 'u1', scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL, catalogVersion: 3 });
  assert.equal(ok.ok, true);
  const reused = assertRevealToken({
    user_id: 'u1',
    scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
    catalog_version: 3,
    used_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000)
  }, { userId: 'u1', scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL, catalogVersion: 3 });
  assert.equal(reused.ok, false);
  const otherScope = assertRevealToken({
    user_id: 'u1',
    scope: PIN_SCOPES.WITHDRAWAL_STEP_UP,
    catalog_version: 3,
    expires_at: new Date(Date.now() + 60_000)
  }, { userId: 'u1', scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL, catalogVersion: 3 });
  assert.equal(otherScope.ok, false);
});

test('PIN 전 입금 안내는 원문·QR을 빼다', () => {
  const challenge = challengePayload({
    destinations: [{
      id: 'd1',
      destination_type: 'usdt',
      label: '고정 USDT',
      masked_value: 'TABCDE…STUV',
      account_number: '110-123-456',
      usdt_address: 'TABCDEFGHIJKLMNOPQRSTUV',
      qr_asset_path: 'private/qr.png',
      guidance_text: '원문이 섞이면 안 됨',
      account_holder: '퍼뜩',
      usdt_network: 'TRC20'
    }],
    pinSet: true,
    catalogVersion: 2
  });
  assert.equal(challenge.pin_required, true);
  assert.match(challenge.copy, /보안 PIN/);
  assert.equal(challenge.destinations[0].usdt_address, undefined);
  assert.equal(challenge.destinations[0].account_number, undefined);
  assert.equal(challenge.destinations[0].qr_asset_path, undefined);
  assert.equal(challenge.destinations[0].has_qr, true);
  const stripped = stripDepositSecrets({ encrypted_value: 'secret', masked_value: '****1234', bank_name: '국민은행' });
  assert.equal(stripped.encrypted_value, undefined);
  assert.equal(stripped.masked_value, '****1234');
  assert.equal(DEPOSIT_INFO_PIN_REQUIRED, 'DEPOSIT_INFO_PIN_REQUIRED');
});

test('USDT 입금은 운영자 고정 주소이고 화면만 바꾸면 추적이 깨진다', () => {
  assert.equal(USDT_DEPOSIT_ADDRESS_MODE, 'operator_fixed');
  assert.equal(assertUsdtDepositPolicy(), 'operator_fixed');
  assert.throws(() => assertUsdtDepositPolicy('per_user_trc20'));
  assert.equal(usdtDepositTrackable({ destination_id: 'dest-1', usdt_network: 'TRC20' }), true);
  assert.equal(usdtDepositTrackable({ usdt_network: 'TRC20' }), false);
  assert.equal(bumpDestinationVersion(2, { addressChanged: true, reason: '운영 계좌 교체' }), 3);
  assert.throws(() => bumpDestinationVersion(2, { addressChanged: true, reason: '' }));
});

test('회원 앱과 운영자 앱에 PIN 게이트·고정 USDT 정책이 있다', async () => {
  const { appJs, memberHtml, adminHtml } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  const finance = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const middleware = await readRepo('functions', '_middleware.js');
  assert.match(appJs, /deposit_info_reveal/);
  assert.match(appJs, /set_security_pin/);
  assert.match(appJs, /보안 PIN 입력 후 입금 안내 확인/);
  assert.match(appJs, /deposit_info_lock/);
  assert.match(finance, /DEPOSIT_INFO_PIN_REQUIRED/);
  assert.match(finance, /deposit_info_reveal/);
  assert.match(adminJs, /입금 안내 설정/);
  assert.match(adminJs, /USDT 고정 주소/);
  assert.match(adminJs, /reset_security_pin/);
  assert.equal(adminJs.includes('원문 계좌는 적지 마세요'), false);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.match(middleware, /staticPath/);
});
