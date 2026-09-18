// 지급정보(계좌·USDT) 애플리케이션 암호화. 원문은 Edge에서만 잠깐 복호화한다.
// 형식: enc.v1.{iv_b64url}.{ciphertext_b64url}  (AES-256-GCM)
// 예전 평문 행은 읽기만 폴백. 새로 저장할 때 키가 없으면 중단한다. 키 이름은 PUTDUK_PAYOUT_SECRET.

export const PAYOUT_CIPHER_PREFIX = 'enc.v1.';

export function isPayoutCiphertext(value) {
  return String(value || '').startsWith(PAYOUT_CIPHER_PREFIX);
}

function bytesToB64Url(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(buf).toString('base64url');
}

function b64UrlToBytes(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

async function importPayoutKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(secret)));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function missingPayoutSecret() {
  const error = new Error('입금 안내를 잠시 열지 못했어요. 운영자에게 알려 주세요.');
  error.status = 503;
  error.code = 'PAYOUT_SECRET_MISSING';
  throw error;
}

export async function encryptPayoutSecret(plain, secret) {
  const text = String(plain ?? '').trim();
  if (!text) return null;
  if (isPayoutCiphertext(text)) return text;
  if (!String(secret || '').trim()) missingPayoutSecret();
  const key = await importPayoutKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `${PAYOUT_CIPHER_PREFIX}${bytesToB64Url(iv)}.${bytesToB64Url(new Uint8Array(cipher))}`;
}

export async function decryptPayoutSecret(value, secret) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!isPayoutCiphertext(text)) return text;
  if (!String(secret || '').trim()) {
    const error = new Error('입금 안내를 잠시 열지 못했어요. 운영자에게 알려 주세요.');
    error.status = 503;
    error.code = 'PAYOUT_SECRET_MISSING';
    throw error;
  }
  const parts = text.slice(PAYOUT_CIPHER_PREFIX.length).split('.');
  if (parts.length !== 2) {
    const error = new Error('입금 안내를 열지 못했어요. 잠시 후 다시 해 주세요.');
    error.status = 503;
    error.code = 'PAYOUT_SECRET_INVALID';
    throw error;
  }
  try {
    const key = await importPayoutKey(secret);
    const iv = b64UrlToBytes(parts[0]);
    const data = b64UrlToBytes(parts[1]);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch (error) {
    if (error && error.code === 'PAYOUT_SECRET_MISSING') throw error;
    const fail = new Error('입금 안내를 열지 못했어요. 잠시 후 다시 해 주세요.');
    fail.status = 503;
    fail.code = 'PAYOUT_SECRET_INVALID';
    throw fail;
  }
}
