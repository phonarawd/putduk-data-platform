// Edge Function 공통 응답·권한 처리. JWT는 게이트웨이 verify_jwt 이후 페이로드만 읽는다.

import { isUuid } from "./validate.ts";

export type JsonRecord = Record<string, unknown>;
export type AuthUser = { id: string; email: string | null };

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const BUILTIN_ALLOWED_ORIGINS = new Set([
  "https://app.hiptk.app",
  "https://ops.hiptk.app"
]);

export function corsHeaders(request: Request): HeadersInit {
  const configured = (Deno.env.get("PUTDUK_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const allowOrigin = configured.includes("*")
    ? "*"
    : requestOrigin && (configured.includes(requestOrigin) || BUILTIN_ALLOWED_ORIGINS.has(requestOrigin))
      ? requestOrigin
      : configured[0] || [...BUILTIN_ALLOWED_ORIGINS][0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function jsonResponse(request: Request, body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const CLIENT_IP_HEADERS = [
  "cf-connecting-ip",
  "true-client-ip",
  "x-real-ip",
  "x-client-ip",
  "fly-client-ip",
  "x-forwarded-for"
] as const;

function sanitizeClientIp(raw: unknown): string | null {
  let value = String(raw ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "unknown" || lower === "undefined" || lower === "null" || lower === "-") return null;
  if (value.includes(",")) value = value.split(",")[0].trim();
  value = value.replace(/^"+|"+$/g, "").trim();
  const bracket = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) value = bracket[1];
  const zone = value.indexOf("%");
  if (zone > 0) value = value.slice(0, zone);
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) value = mapped[1];
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split(".").map((part) => Number(part));
    if (parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return value;
    return null;
  }
  if (value.includes(":") && /^[0-9a-f:]+$/i.test(value)) return value.toLowerCase();
  return null;
}

function isPrivateClientIp(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "127.0.0.1" || value === "0.0.0.0" || value === "::1" || value === "::") return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  if (value.startsWith("169.254.")) return true;
  const lan = value.match(/^172\.(\d+)\./);
  if (lan) {
    const octet = Number(lan[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  return false;
}

export type ClientConnInfo = {
  remoteAddr?: {
    hostname?: string;
  };
};

export function clientIp(request: Request, info?: ClientConnInfo): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const ip = sanitizeClientIp(raw);
    if (!ip || seen.has(ip)) return;
    seen.add(ip);
    candidates.push(ip);
  };
  for (const key of CLIENT_IP_HEADERS) {
    const header = request.headers.get(key);
    if (!header) continue;
    header.split(",").forEach(push);
  }
  push(info?.remoteAddr?.hostname);
  return candidates.find((ip) => !isPrivateClientIp(ip)) || candidates[0] || null;
}

export function userFromVerifiedJwt(request: Request, loginCopy = "로그인이 필요합니다."): AuthUser {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, loginCopy);
  const parts = token.split(".");
  if (parts.length < 2) throw new HttpError(401, "세션이 만료됐습니다.");
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: string; email?: string; exp?: number };
    if (!payload.sub || !isUuid(payload.sub)) throw new HttpError(401, "세션이 만료됐습니다.");
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 5000) {
      throw new HttpError(401, "세션이 만료됐습니다.");
    }
    return { id: payload.sub, email: payload.email || null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "세션이 만료됐습니다.");
  }
}

export function rpcMessage(error: { message?: string } | null, fallback: string): string {
  const message = String(error?.message || "");
  if (!message) return fallback;
  if (
    message.includes("권한") ||
    message.includes("상태") ||
    message.includes("필요") ||
    message.includes("확인") ||
    message.includes("입력") ||
    message.includes("부족") ||
    message.includes("올바르") ||
    message.includes("찾을 수") ||
    message.includes("잠겨") ||
    message.includes("선택") ||
    message.includes("잠금") ||
    message.includes("소진") ||
    message.includes("체험") ||
    message.includes("출금") ||
    message.includes("거절") ||
    message.includes("이중") ||
    message.includes("처리 중") ||
    message.includes("근무") ||
    message.includes("카드") ||
    message.includes("라인") ||
    message.includes("예상") ||
    message.includes("골라") ||
    message.includes("보기") ||
    message.includes("제출") ||
    message.includes("대조") ||
    message.includes("물량") ||
    message.includes("번호") ||
    message.includes("상품") ||
    message.includes("중간") ||
    message.includes("저장") ||
    message.includes("보안") ||
    message.includes("PIN") ||
    message.includes("비밀번호") ||
    message.includes("만료") ||
    message.includes("토큰") ||
    message.includes("안내") ||
    message.includes("횟수")
  ) {
    return message;
  }
  return fallback;
}
