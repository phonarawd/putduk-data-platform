// 입금 안내 공개용 보안 PIN. 평문은 저장하지 않고 scrypt 해시만 쓴다.
// 출금 step-up(withdrawal_step_up)과 공개 토큰 scope를 섞지 않는다.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PIN_SCOPES = Object.freeze({
  DEPOSIT_INFO_REVEAL: 'deposit_info_reveal',
  WITHDRAWAL_STEP_UP: 'withdrawal_step_up'
});

export const DEPOSIT_PIN_POLICY = Object.freeze({
  maxFailures: 5,
  lockSeconds: 15 * 60,
  revealTtlSeconds: 90,
  kdf: 'scrypt',
  scrypt: Object.freeze({ N: 16384, r: 8, p: 1, keyLen: 32 }),
  pinPattern: /^[0-9]{6}$/
});

export const DEPOSIT_INFO_PIN_REQUIRED = 'DEPOSIT_INFO_PIN_REQUIRED';
export const DEPOSIT_INFO_LOCKED = 'DEPOSIT_INFO_LOCKED';
export const DEPOSIT_INFO_TOKEN_INVALID = 'DEPOSIT_INFO_TOKEN_INVALID';

const SECRET_KEYS = [
  'account_number',
  'account_holder',
  'usdt_address',
  'encrypted_value',
  'qr_asset_path',
  'qr_signed_url',
  'qr_payload',
  'memo',
  'guidance_text',
  'plain_value'
];

export function isSixDigitPin(value) {
  return DEPOSIT_PIN_POLICY.pinPattern.test(String(value || ''));
}

export function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

export function hashPin(pin, saltBytes = randomBytes(16)) {
  if (!isSixDigitPin(pin)) throw new Error('보안 PIN은 숫자 6자리여야 해요.');
  const { N, r, p, keyLen } = DEPOSIT_PIN_POLICY.scrypt;
  const derived = scryptSync(String(pin), saltBytes, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${toBase64Url(saltBytes)}$${toBase64Url(derived)}`;
}

export function verifyPin(pin, storedHash) {
  const raw = String(storedHash || '');
  const parts = raw.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  if (!isSixDigitPin(pin)) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = fromBase64Url(parts[4]);
  const expected = fromBase64Url(parts[5]);
  if (!Number.isFinite(N) || !salt.length || !expected.length) return false;
  const derived = scryptSync(String(pin), salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function hashIp(ip) {
  const candidate = String(ip || '').trim();
  if (!candidate) return null;
  return sha256Hex(`putduk-ip:${candidate}`);
}

export function newRevealToken() {
  const token = `drev_${toBase64Url(randomBytes(32))}`;
  return {
    token,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + DEPOSIT_PIN_POLICY.revealTtlSeconds * 1000)
  };
}

export function registerPinFailure(failedAttempts = 0, now = new Date()) {
  const next = Number(failedAttempts || 0) + 1;
  const locked = next >= DEPOSIT_PIN_POLICY.maxFailures;
  return {
    failedAttempts: next,
    locked,
    remaining: Math.max(0, DEPOSIT_PIN_POLICY.maxFailures - next),
    lockedUntil: locked ? new Date(now.getTime() + DEPOSIT_PIN_POLICY.lockSeconds * 1000) : null
  };
}

export function isPinLocked(lockedUntil, now = new Date()) {
  if (!lockedUntil) return false;
  const until = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > now.getTime();
}

export function assertRevealToken(row, { userId, scope, catalogVersion, now = new Date() } = {}) {
  if (!row) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '입금 안내가 다시 잠겼어요. 보안 PIN을 다시 입력해 주세요.' };
  }
  if (String(row.user_id) !== String(userId || '')) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '이 공개 토큰은 다른 사원 계정용이에요.' };
  }
  if (String(row.scope) !== String(scope || PIN_SCOPES.DEPOSIT_INFO_REVEAL)) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '출금 확인과 입금 안내 공개는 따로 잠겨 있어요.' };
  }
  if (Number(row.catalog_version) !== Number(catalogVersion)) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '입금 안내가 바뀌어서 다시 PIN을 입력해 주세요.' };
  }
  if (row.revoked_at) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '공개 토큰이 회수됐어요. 다시 PIN을 입력해 주세요.' };
  }
  if (row.used_at) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '이미 사용한 공개 토큰이에요. 다시 PIN을 입력해 주세요.' };
  }
  const expires = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= now.getTime()) {
    return { ok: false, code: DEPOSIT_INFO_TOKEN_INVALID, copy: '공개 시간이 끝났어요. 다시 PIN을 입력해 주세요.' };
  }
  return { ok: true };
}

export function stripDepositSecrets(row) {
  const src = row && typeof row === 'object' ? row : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (SECRET_KEYS.includes(key)) continue;
    out[key] = value;
  }
  out.has_qr = Boolean(src.has_qr || src.qr_asset_path || src.qr_signed_url || src.qr_payload);
  if (src.destination_type) out.destination_type = src.destination_type;
  if (src.masked_value) out.masked_value = src.masked_value;
  if (src.label) out.label = src.label;
  if (src.bank_name) out.bank_name = src.bank_name;
  if (src.usdt_network) out.usdt_network = src.usdt_network;
  if (src.info_version != null) out.info_version = src.info_version;
  if (src.id) out.id = src.id;
  return out;
}

export function challengePayload({ destinations = [], pinSet = false, lockedUntil = null, catalogVersion = 1, now = new Date() } = {}) {
  const locked = isPinLocked(lockedUntil, now);
  const methods = [];
  const assets = [];
  for (const row of destinations) {
    const type = String(row.destination_type || '');
    if (type === 'bank' && !methods.includes('원화 계좌')) methods.push('원화 계좌');
    if (type === 'usdt' && !methods.includes('USDT')) methods.push('USDT');
    if (type === 'bank' && !assets.includes('KRW')) assets.push('KRW');
    if (type === 'usdt' && !assets.includes('USDT')) assets.push('USDT');
  }
  return {
    pin_required: true,
    pin_set: Boolean(pinSet),
    locked,
    locked_until: locked ? (lockedUntil instanceof Date ? lockedUntil.toISOString() : lockedUntil) : null,
    catalog_version: Number(catalogVersion || 1),
    ttl_seconds: DEPOSIT_PIN_POLICY.revealTtlSeconds,
    methods,
    assets,
    destinations: destinations.map(stripDepositSecrets),
    copy: locked
      ? '🔒 보안 PIN이 잠시 잠겨 있어요. 조금 뒤에 다시 시도해 주세요.'
      : '🔐 보안 PIN 입력 후 입금 안내 확인'
  };
}

export function hasLeakedSecrets(payload) {
  const text = JSON.stringify(payload || {});
  return SECRET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload || {}, key))
    || SECRET_KEYS.some((key) => text.includes(`"${key}"`));
}
