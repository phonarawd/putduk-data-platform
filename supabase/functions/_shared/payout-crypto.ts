// 지급정보(계좌·USDT) 애플리케이션 암호화. 원문은 Edge에서만 잠깐 복호화한다.
// 형식: enc.v1.{iv_b64url}.{ciphertext_b64url}  (AES-256-GCM)

export const PAYOUT_CIPHER_PREFIX = "enc.v1.";

export function isPayoutCiphertext(value: unknown) {
  return String(value || "").startsWith(PAYOUT_CIPHER_PREFIX);
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function importPayoutKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(new TextEncoder().encode(secret)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function payoutSecretFromEnv() {
  return String(Deno.env.get("PUTDUK_PAYOUT_SECRET") || "").trim();
}

function missingPayoutSecret(): never {
  const error = new Error("입금 안내를 잠시 열지 못했어요. 운영자에게 알려 주세요.") as Error & {
    status?: number;
    code?: string;
  };
  error.status = 503;
  error.code = "PAYOUT_SECRET_MISSING";
  throw error;
}

export async function encryptPayoutSecret(plain: unknown, secret: string) {
  const text = String(plain ?? "").trim();
  if (!text) return null;
  if (isPayoutCiphertext(text)) return text;
  if (!String(secret || "").trim()) missingPayoutSecret();
  const key = await importPayoutKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toArrayBuffer(new TextEncoder().encode(text))
  );
  return `${PAYOUT_CIPHER_PREFIX}${bytesToB64Url(iv)}.${bytesToB64Url(new Uint8Array(cipher))}`;
}

export async function decryptPayoutSecret(value: unknown, secret: string) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!isPayoutCiphertext(text)) return text;
  if (!String(secret || "").trim()) {
    const error = new Error("입금 안내를 잠시 열지 못했어요. 운영자에게 알려 주세요.") as Error & { status?: number; code?: string };
    error.status = 503;
    error.code = "PAYOUT_SECRET_MISSING";
    throw error;
  }
  const parts = text.slice(PAYOUT_CIPHER_PREFIX.length).split(".");
  if (parts.length !== 2) {
    const error = new Error("입금 안내를 열지 못했어요. 잠시 후 다시 해 주세요.") as Error & { status?: number; code?: string };
    error.status = 503;
    error.code = "PAYOUT_SECRET_INVALID";
    throw error;
  }
  try {
    const key = await importPayoutKey(secret);
    const iv = b64UrlToBytes(parts[0]);
    const data = b64UrlToBytes(parts[1]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, toArrayBuffer(data));
    return new TextDecoder().decode(plain);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PAYOUT_SECRET_MISSING") {
      throw error;
    }
    const fail = new Error("입금 안내를 열지 못했어요. 잠시 후 다시 해 주세요.") as Error & { status?: number; code?: string };
    fail.status = 503;
    fail.code = "PAYOUT_SECRET_INVALID";
    throw fail;
  }
}
