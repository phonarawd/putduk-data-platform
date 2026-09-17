// 입금 안내 공개 PIN. scrypt 해시·짧은 공개 토큰. 출금 scope와 섞지 않는다.

import { scryptAsync } from "https://esm.sh/@noble/hashes@1.8.0/scrypt.js";

export const PIN_SCOPES = {
  DEPOSIT_INFO_REVEAL: "deposit_info_reveal",
  WITHDRAWAL_STEP_UP: "withdrawal_step_up"
} as const;

export const DEPOSIT_PIN_POLICY = {
  maxFailures: 5,
  lockSeconds: 15 * 60,
  revealTtlSeconds: 90,
  kdf: "scrypt",
  scrypt: { N: 16384, r: 8, p: 1, dkLen: 32 }
} as const;

export const DEPOSIT_INFO_PIN_REQUIRED = "DEPOSIT_INFO_PIN_REQUIRED";
export const DEPOSIT_INFO_LOCKED = "DEPOSIT_INFO_LOCKED";
export const DEPOSIT_INFO_TOKEN_INVALID = "DEPOSIT_INFO_TOKEN_INVALID";

const SECRET_KEYS = new Set([
  "account_number",
  "account_holder",
  "usdt_address",
  "encrypted_value",
  "qr_asset_path",
  "qr_signed_url",
  "qr_payload",
  "memo",
  "guidance_text",
  "plain_value"
]);

const PIN_PATTERN = /^[0-9]{6}$/;

export function isSixDigitPin(value: unknown): boolean {
  return PIN_PATTERN.test(String(value || ""));
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

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPin(pin: string): Promise<string> {
  if (!isSixDigitPin(pin)) throw new Error("보안 PIN은 숫자 6자리여야 해요.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { N, r, p, dkLen } = DEPOSIT_PIN_POLICY.scrypt;
  const derived = await scryptAsync(utf8(pin), salt, { N, r, p, dkLen });
  return `scrypt$${N}$${r}$${p}$${bytesToB64Url(salt)}$${bytesToB64Url(derived)}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || !isSixDigitPin(pin)) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = b64UrlToBytes(parts[4]);
  const expected = b64UrlToBytes(parts[5]);
  if (!Number.isFinite(N) || !salt.length || !expected.length) return false;
  const derived = await scryptAsync(utf8(pin), salt, { N, r, p, dkLen: expected.length });
  return timingSafeEqual(derived, expected);
}

export async function hashIp(ip: string | null | undefined): Promise<string | null> {
  const candidate = String(ip || "").trim();
  if (!candidate) return null;
  return sha256Hex(`putduk-ip:${candidate}`);
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function newRevealToken(ttlSeconds = DEPOSIT_PIN_POLICY.revealTtlSeconds) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = `drev_${bytesToB64Url(raw)}`;
  return {
    token,
    tokenHash: await hashToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000)
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

export function isPinLocked(lockedUntil: string | Date | null | undefined, now = new Date()) {
  if (!lockedUntil) return false;
  const until = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > now.getTime();
}

export function stripDepositSecrets(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = value;
  }
  out.has_qr = Boolean(row?.has_qr || row?.qr_asset_path || row?.qr_signed_url || row?.qr_payload);
  return out;
}

export function challengePayload(input: {
  destinations?: Record<string, unknown>[];
  pinSet?: boolean;
  lockedUntil?: string | Date | null;
  catalogVersion?: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  const locked = isPinLocked(input.lockedUntil || null, now);
  const destinations = Array.isArray(input.destinations) ? input.destinations : [];
  const methods: string[] = [];
  const assets: string[] = [];
  for (const row of destinations) {
    const type = String(row.destination_type || "");
    if (type === "bank" && !methods.includes("원화 계좌")) methods.push("원화 계좌");
    if (type === "usdt" && !methods.includes("USDT")) methods.push("USDT");
    if (type === "bank" && !assets.includes("KRW")) assets.push("KRW");
    if (type === "usdt" && !assets.includes("USDT")) assets.push("USDT");
  }
  return {
    pin_required: true,
    pin_set: Boolean(input.pinSet),
    locked,
    locked_until: locked
      ? (input.lockedUntil instanceof Date ? input.lockedUntil.toISOString() : input.lockedUntil)
      : null,
    catalog_version: Number(input.catalogVersion || 1),
    ttl_seconds: DEPOSIT_PIN_POLICY.revealTtlSeconds,
    methods,
    assets,
    destinations: destinations.map((row) => stripDepositSecrets(row)),
    copy: locked
      ? "🔒 보안 PIN이 잠시 잠겨 있어요. 조금 뒤에 다시 시도해 주세요."
      : "🔐 보안 PIN 입력 후 입금 안내 확인"
  };
}
