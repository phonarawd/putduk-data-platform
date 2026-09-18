// 백엔드 입력 검증. 화면 문구는 한국어로 유지한다.

export const PIN_PATTERN = /^[0-9]{6}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CURRENCIES = ["KRW", "USDT"] as const;
export const REFERRAL_REWARD_KRW = 5000;
export const SIGNED_URL_SECONDS = 60;
export const PRIVATE_BUCKET = "putduk-private";
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isUuid(value: unknown): boolean {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function isSixDigitPin(value: unknown): boolean {
  return PIN_PATTERN.test(String(value || ""));
}

export function isSupportedCurrency(value: unknown): boolean {
  return CURRENCIES.includes(String(value || "").toUpperCase() as typeof CURRENCIES[number]);
}

export function isValidSlug(value: unknown): boolean {
  return SLUG_PATTERN.test(String(value || "").trim());
}

export function isAmountInRange(value: unknown, min = 1000, max = 100_000_000): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= min && amount <= max;
}

export function isOwnStoragePath(userId: string, path: unknown): boolean {
  const candidate = String(path || "").trim();
  if (!candidate || candidate.includes("..") || candidate.startsWith("/") || candidate.includes("\\") || candidate.length > 500) {
    return false;
  }
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[0] === userId) return parts.length >= 3 || Boolean(parts[1]);
  if (parts[0] === "kyc" || parts[0] === "deposit-proof" || parts[0] === "deposit_proof") {
    return parts[1] === userId && parts.length >= 3;
  }
  return false;
}

export function isAllowedUploadType(value: unknown): boolean {
  return ALLOWED_UPLOAD_TYPES.includes(String(value || "").toLowerCase());
}

export function maskAccount(bankName: string, accountNumber: string): string {
  const digits = String(accountNumber || "").replace(/\s/g, "");
  const tail = digits.slice(-4);
  return `${String(bankName || "").slice(0, 20)} ****${tail}`;
}

export function maskUsdt(address: string): string {
  const value = String(address || "").trim();
  if (value.length < 12) return "****";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
