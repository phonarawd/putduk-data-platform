// 비공개 파일 미리보기 경로 게이트. 역할만으로 열지 않고 prefix+회원 UUID+용도를 본다.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PreviewFamily = "kyc" | "finance";

export function normalizePreviewPurpose(purpose: unknown) {
  const value = String(purpose || "").trim().toLowerCase().replace(/-/g, "_");
  if (value === "kyc" || value === "kyc_review") return "kyc";
  if (value === "" || value === "finance" || value === "deposit_proof" || value === "depositproof") return "finance";
  return value;
}

export function parsePrivatePreviewPath(path: unknown): {
  ok: boolean;
  status?: number;
  message?: string;
  family?: PreviewFamily;
  memberId?: string;
} {
  const raw = String(path || "").trim();
  if (!raw || raw.includes("..") || raw.startsWith("/") || raw.includes("\\") || raw.length > 500) {
    return { ok: false, status: 400, message: "파일 경로가 올바르지 않아요." };
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 3) {
    return { ok: false, status: 403, message: "이 파일은 지금 권한으로 열 수 없어요." };
  }
  if (parts[0] === "kyc" && UUID_RE.test(parts[1])) {
    return { ok: true, family: "kyc", memberId: parts[1].toLowerCase() };
  }
  if ((parts[0] === "deposit-proof" || parts[0] === "deposit_proof") && UUID_RE.test(parts[1])) {
    return { ok: true, family: "finance", memberId: parts[1].toLowerCase() };
  }
  if (UUID_RE.test(parts[0]) && parts[1] === "kyc") {
    return { ok: true, family: "kyc", memberId: parts[0].toLowerCase() };
  }
  if (UUID_RE.test(parts[0]) && (parts[1] === "deposit_proof" || parts[1] === "deposit-proof")) {
    return { ok: true, family: "finance", memberId: parts[0].toLowerCase() };
  }
  return { ok: false, status: 403, message: "이 파일은 지금 권한으로 열 수 없어요." };
}

export function assertPrivatePreviewAccess(path: unknown, purpose: unknown, roles: readonly string[] = []) {
  const parsed = parsePrivatePreviewPath(path);
  if (!parsed.ok) return parsed;
  const want = normalizePreviewPurpose(purpose);
  const roleList = Array.isArray(roles) ? roles.map((role) => String(role || "")) : [];
  const isSuper = roleList.includes("super_admin");
  const isKyc = isSuper || roleList.includes("kyc_review");
  const isFinance = isSuper || roleList.includes("finance");

  if (parsed.family === "kyc") {
    if (!isKyc) {
      return { ok: false, status: 403, message: "본인확인 자료는 해당 담당자만 볼 수 있어요." };
    }
    if (want !== "kyc" && !isSuper) {
      return { ok: false, status: 403, message: "파일 용도와 경로가 맞지 않아요." };
    }
    return { ok: true, family: "kyc" as const, memberId: parsed.memberId };
  }

  if (parsed.family === "finance") {
    if (!isFinance) {
      return { ok: false, status: 403, message: "입금 증빙은 해당 담당자만 볼 수 있어요." };
    }
    if (want !== "finance" && !isSuper) {
      return { ok: false, status: 403, message: "파일 용도와 경로가 맞지 않아요." };
    }
    return { ok: true, family: "finance" as const, memberId: parsed.memberId };
  }

  return { ok: false, status: 403, message: "이 파일은 지금 권한으로 열 수 없어요." };
}
