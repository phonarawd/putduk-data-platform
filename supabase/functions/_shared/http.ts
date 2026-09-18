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

export function corsHeaders(request: Request): HeadersInit {
  const configured = (Deno.env.get("PUTDUK_ALLOWED_ORIGINS") || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const allowOrigin = configured.includes("*")
    ? "*"
    : configured.includes(requestOrigin)
      ? requestOrigin
      : configured[0] || "null";

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
