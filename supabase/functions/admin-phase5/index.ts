import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

// PHASE 5 admin compatibility wrapper.
// Existing admin-control remains untouched. Only PHASE 5 KYC / payout reveal actions are handled here;
// every other admin action is forwarded to the existing admin-control function with the caller JWT.

type JsonRecord = Record<string, unknown>;
type AuthUser = { id: string; email: string | null };

class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const OLD_ADMIN_URL = `${supabaseUrl}/functions/v1/admin-control`;
const PRIVATE_BUCKET = "putduk-private";
const SIGNED_URL_SECONDS = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KYC_ROLES = ["super_admin", "kyc_review"];
const FINANCE_ROLES = ["super_admin", "finance"];

function corsHeaders(request: Request): HeadersInit {
  const configured = (Deno.env.get("PUTDUK_ALLOWED_ORIGINS") || "*")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origin = request.headers.get("origin") || "";
  const allowOrigin = configured.includes("*") ? "*" : configured.includes(origin) ? origin : configured[0] || "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function userFromVerifiedJwt(request: Request): AuthUser {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "운영자 로그인이 필요합니다.");
  const parts = token.split(".");
  if (parts.length < 2) throw new HttpError(401, "세션이 만료됐습니다.");
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: string; email?: string; exp?: number };
    if (!payload.sub || !UUID_RE.test(payload.sub)) throw new HttpError(401, "세션이 만료됐습니다.");
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 5000) throw new HttpError(401, "세션이 만료됐습니다.");
    return { id: payload.sub, email: payload.email || null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "세션이 만료됐습니다.");
  }
}

async function parseRequest(request: Request): Promise<JsonRecord> {
  if (request.method === "GET" || request.method === "HEAD") {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as JsonRecord : {};
  } catch {
    throw new HttpError(400, "요청 형식을 확인해 주세요.");
  }
}

function uuid(value: unknown, label: string) {
  const candidate = String(value || "").trim();
  if (!UUID_RE.test(candidate)) throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
  return candidate;
}

function text(value: unknown, label: string, max = 500, required = true): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate && !required) return null;
  if (!candidate) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (candidate.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return candidate;
}

async function hasAnyRole(userId: string, roles: string[]) {
  const { data, error } = await admin.rpc("putduk_admin_has_role", { p_user_id: userId, p_roles: roles });
  if (error) {
    console.error("admin role check failed", error);
    throw new HttpError(503, "운영자 권한을 확인하지 못했습니다.");
  }
  return data === true;
}

async function requireAnyRole(userId: string, roles: string[]) {
  if (!await hasAnyRole(userId, roles)) throw new HttpError(403, "이 메뉴를 사용할 권한이 없습니다.");
}

async function appendAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string | null,
  afterData: JsonRecord | null
) {
  const { error } = await admin.rpc("putduk_admin_append_audit", {
    p_admin_id: adminId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_before: null,
    p_after: afterData
  });
  if (error) {
    console.error("admin audit append failed", error);
    throw new HttpError(503, "변경 기록을 남기지 못해 작업을 완료하지 못했습니다.");
  }
}

function normalizeKycStatus(status: unknown) {
  return String(status || "") === "submitted" ? "review_pending" : String(status || "");
}

async function listKyc(userId: string) {
  await requireAnyRole(userId, KYC_ROLES);
  const { data, error } = await admin
    .from("profiles")
    .select("id,public_id,display_name,kyc_status,status,created_at,updated_at")
    .in("kyc_status", ["review_pending", "submitted", "approved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(120);
  if (error) throw new HttpError(503, "본인확인 목록을 불러오지 못했습니다.");
  const profiles = Array.isArray(data) ? data : [];
  const memberIds = profiles.map((row) => String(row.id || "")).filter(Boolean);
  if (!memberIds.length) return [];

  const { data: docs, error: docsError } = await admin
    .schema("private")
    .from("kyc_documents")
    .select("user_id,document_kind,status,reviewed_at,created_at")
    .in("user_id", memberIds)
    .in("document_kind", ["identity_front", "identity_back", "selfie"]);
  if (docsError) throw new HttpError(503, "본인확인 서류 목록을 불러오지 못했습니다.");

  const docsByUser = new Map<string, JsonRecord[]>();
  for (const raw of docs || []) {
    const row = raw as JsonRecord;
    const memberId = String(row.user_id || "");
    if (!memberId) continue;
    const list = docsByUser.get(memberId) || [];
    list.push({ kind: row.document_kind, status: row.status, reviewed_at: row.reviewed_at, submitted_at: row.created_at });
    docsByUser.set(memberId, list);
  }

  return profiles.map((row) => ({
    ...row,
    kyc_status: normalizeKycStatus(row.kyc_status),
    documents: docsByUser.get(String(row.id || "")) || []
  }));
}

async function reviewKyc(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, KYC_ROLES);
  const memberId = uuid(payload.user_id || payload.member_id || payload.document_id, "회원");
  const decision = text(payload.decision, "처리 결과", 20) as string;
  const reason = text(payload.reason, "사유", 500, false);
  const { data, error } = await admin.rpc("putduk_admin_review_kyc", {
    p_admin_id: userId,
    p_user_id: memberId,
    p_decision: decision,
    p_reason: reason
  });
  if (error || data == null) throw new HttpError(400, String(error?.message || "본인확인 처리를 저장하지 못했습니다."));
  const normalized = data === "approved" || data === "rejected" ? String(data) : normalizeKycStatus(data);
  await appendAudit(userId, decision === "approved" ? "KYC approved" : "KYC rejected", "kyc", memberId, reason, { decision: normalized });
  return { kyc_status: normalized };
}

function parsePrivatePreviewPath(path: string) {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\") || path.length > 500) {
    throw new HttpError(400, "파일 경로가 올바르지 않아요.");
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) throw new HttpError(403, "이 파일은 지금 권한으로 열 수 없어요.");
  if (parts[0] === "kyc" && UUID_RE.test(parts[1])) return { family: "kyc", memberId: parts[1].toLowerCase() };
  if ((parts[0] === "deposit-proof" || parts[0] === "deposit_proof") && UUID_RE.test(parts[1])) return { family: "finance", memberId: parts[1].toLowerCase() };
  if (UUID_RE.test(parts[0]) && parts[1] === "kyc") return { family: "kyc", memberId: parts[0].toLowerCase() };
  if (UUID_RE.test(parts[0]) && (parts[1] === "deposit-proof" || parts[1] === "deposit_proof")) return { family: "finance", memberId: parts[0].toLowerCase() };
  throw new HttpError(403, "이 파일은 지금 권한으로 열 수 없어요.");
}

async function previewPrivateFile(userId: string, payload: JsonRecord) {
  const path = text(payload.path, "파일 경로", 500) as string;
  const parsed = parsePrivatePreviewPath(path);
  const purpose = String(payload.purpose || parsed.family || "").trim().toLowerCase().replace(/-/g, "_");
  if (parsed.family === "kyc") {
    await requireAnyRole(userId, KYC_ROLES);
    if (!["kyc", "kyc_review"].includes(purpose) && !await hasAnyRole(userId, ["super_admin"])) {
      throw new HttpError(403, "파일 용도와 경로가 맞지 않아요.");
    }
  } else {
    await requireAnyRole(userId, FINANCE_ROLES);
    if (!["finance", "deposit_proof", "depositproof", ""].includes(purpose) && !await hasAnyRole(userId, ["super_admin"])) {
      throw new HttpError(403, "파일 용도와 경로가 맞지 않아요.");
    }
  }
  const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new HttpError(404, "파일을 찾을 수 없습니다.");
  await appendAudit(
    userId,
    parsed.family === "kyc" ? "KYC preview" : "입금 증빙 preview",
    parsed.family === "kyc" ? "kyc" : "deposit_proof",
    parsed.memberId,
    null,
    { purpose: purpose || parsed.family, family: parsed.family }
  );
  return { signed_url: data.signedUrl, expires_in: SIGNED_URL_SECONDS };
}

async function previewKycDocument(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, KYC_ROLES);
  const memberId = uuid(payload.user_id || payload.member_id, "회원");
  const kind = String(payload.document_kind || payload.kind || "").trim().toLowerCase();
  if (!["identity_front", "identity_back", "selfie"].includes(kind)) throw new HttpError(400, "본인확인 파일 종류를 확인해 주세요.");
  const { data: doc, error } = await admin
    .schema("private")
    .from("kyc_documents")
    .select("storage_path")
    .eq("user_id", memberId)
    .eq("document_kind", kind)
    .maybeSingle();
  if (error || !doc?.storage_path) throw new HttpError(404, "본인확인 파일을 찾을 수 없습니다.");
  const preview = await previewPrivateFile(userId, { path: doc.storage_path, purpose: "kyc" });
  const storagePath = String(doc.storage_path || "");
  return { ...preview, preview_type: storagePath.toLowerCase().endsWith(".pdf") ? "pdf" : "image" };
}

const CIPHER_PREFIX = "enc.v1.";
function b64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function toArrayBuffer(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
async function payoutKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(new TextEncoder().encode(secret)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decryptPayoutSecret(value: unknown, secret: string) {
  const cipher = String(value ?? "").trim();
  if (!cipher) return "";
  if (!cipher.startsWith(CIPHER_PREFIX)) return cipher;
  if (!secret) throw new HttpError(503, "지급정보 복호화 키가 설정되지 않아 열 수 없습니다.", "PAYOUT_SECRET_MISSING");
  const parts = cipher.slice(CIPHER_PREFIX.length).split(".");
  if (parts.length !== 2) throw new HttpError(503, "지급정보를 열지 못했습니다.", "PAYOUT_SECRET_INVALID");
  try {
    const key = await payoutKey(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64UrlToBytes(parts[0]) }, key, toArrayBuffer(b64UrlToBytes(parts[1])));
    return new TextDecoder().decode(plain);
  } catch {
    throw new HttpError(503, "지급정보를 열지 못했습니다.", "PAYOUT_SECRET_INVALID");
  }
}

async function revealWithdrawalDestination(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, FINANCE_ROLES);
  const withdrawalId = uuid(payload.withdrawal_id || payload.id, "출금");
  const secret = String(Deno.env.get("PUTDUK_PAYOUT_SECRET") || "").trim();
  if (!secret) throw new HttpError(503, "지급정보 복호화 키가 설정되지 않아 열 수 없습니다.", "PAYOUT_SECRET_MISSING");

  const { data: withdrawal, error: withdrawalError } = await admin
    .from("withdrawal_requests")
    .select("id,user_id,destination_id,destination_type,destination_masked")
    .eq("id", withdrawalId)
    .maybeSingle();
  if (withdrawalError || !withdrawal) throw new HttpError(404, "출금 요청을 찾을 수 없습니다.");
  if (!withdrawal.destination_id) throw new HttpError(404, "연결된 지급정보가 없습니다.");

  const { data: destination, error: destinationError } = await admin
    .schema("private")
    .from("member_payout_destinations")
    .select("id,user_id,destination_type,bank_name,account_holder,account_number,usdt_network,usdt_address,masked_value")
    .eq("id", withdrawal.destination_id)
    .maybeSingle();
  if (destinationError || !destination) throw new HttpError(404, "지급정보를 찾을 수 없습니다.");
  if (String(destination.user_id || "") !== String(withdrawal.user_id || "")) throw new HttpError(403, "출금 요청과 지급정보가 일치하지 않습니다.");

  const accountHolder = await decryptPayoutSecret(destination.account_holder, secret);
  const accountNumber = await decryptPayoutSecret(destination.account_number, secret);
  const usdtAddress = await decryptPayoutSecret(destination.usdt_address, secret);

  await appendAudit(userId, "출금 지급정보 reveal", "withdrawal_request", withdrawalId, null, {
    destination_id: destination.id,
    destination_type: destination.destination_type,
    masked: withdrawal.destination_masked || destination.masked_value || null
  });

  return {
    withdrawal_id: withdrawalId,
    destination_type: destination.destination_type,
    bank_name: destination.bank_name || null,
    account_holder: accountHolder || null,
    account_number: accountNumber || null,
    usdt_network: destination.usdt_network || null,
    usdt_address: usdtAddress || null,
    expires_in: 60
  };
}


const LANDING_ROLES = ["super_admin"];

function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${label} 값을 확인해 주세요.`);
  }
  return parsed;
}

function optionalDate(value: unknown, label: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} 시간을 확인해 주세요.`);
  return date.toISOString();
}

async function listLandingContent(userId: string) {
  await requireAnyRole(userId, LANDING_ROLES);
  const [metricsResult, reviewsResult, consentsResult] = await Promise.all([
    admin.from("landing_metric_settings").select("*").order("sort_order", { ascending: true }).order("updated_at", { ascending: false }),
    admin.from("landing_reviews").select("*").order("sort_order", { ascending: true }).order("updated_at", { ascending: false }),
    admin.from("landing_review_consents").select("id,user_id,work_submission_id,consent_version,consented_at,revoked_at,evidence_note").is("revoked_at", null).order("consented_at", { ascending: false }).limit(200)
  ]);
  if (metricsResult.error || reviewsResult.error || consentsResult.error) {
    console.error("landing content list failed", metricsResult.error || reviewsResult.error || consentsResult.error);
    throw new HttpError(503, "랜딩 현황과 후기를 불러오지 못했습니다.");
  }
  return { metrics: metricsResult.data || [], reviews: reviewsResult.data || [], consents: consentsResult.data || [] };
}

async function saveLandingMetric(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, LANDING_ROLES);
  const id = payload.id ? uuid(payload.id, "현황") : null;
  const metricKey = text(payload.metric_key, "현황 식별값", 64) as string;
  if (!/^[a-z0-9_]{2,64}$/.test(metricKey)) throw new HttpError(400, "현황 식별값은 영문 소문자, 숫자, 밑줄만 사용할 수 있습니다.");
  const valueType = String(payload.value_type || "");
  if (!["actual_automatic", "operator_confirmed", "goal"].includes(valueType)) throw new HttpError(400, "숫자의 근거 유형을 선택해 주세요.");
  const row = {
    metric_key: metricKey,
    label_ko: text(payload.label_ko, "표시 이름", 60) as string,
    metric_value: integer(payload.metric_value, "표시 숫자"),
    value_type: valueType,
    source_note: text(payload.source_note, "확인 근거", 500) as string,
    measured_at: optionalDate(payload.measured_at, "확인 기준") || new Date().toISOString(),
    is_public: payload.is_public === true,
    sort_order: integer(payload.sort_order ?? 0, "표시 순서", 0, 10000),
    updated_by: userId
  };
  const query = id
    ? admin.from("landing_metric_settings").update(row).eq("id", id).select().single()
    : admin.from("landing_metric_settings").insert(row).select().single();
  const { data, error } = await query;
  if (error || !data) throw new HttpError(400, String(error?.message || "랜딩 현황을 저장하지 못했습니다."));
  return { metric: data };
}

async function saveLandingReview(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, LANDING_ROLES);
  const id = payload.id ? uuid(payload.id, "후기") : null;
  const reviewType = String(payload.review_type || "usage_example");
  if (!["verified_member", "usage_example"].includes(reviewType)) throw new HttpError(400, "후기 유형을 확인해 주세요.");
  const consentId = payload.consent_id ? uuid(payload.consent_id, "동의 기록") : null;
  if (reviewType === "verified_member" && !consentId) throw new HttpError(400, "실제 회원 후기는 유효한 동의 기록을 선택해야 합니다.");
  const publicStartsAt = optionalDate(payload.public_starts_at, "공개 시작");
  const publicEndsAt = optionalDate(payload.public_ends_at, "공개 종료");
  if (publicStartsAt && publicEndsAt && Date.parse(publicEndsAt) <= Date.parse(publicStartsAt)) {
    throw new HttpError(400, "공개 종료는 시작 이후여야 합니다.");
  }
  const row = {
    author_display: text(payload.author_display, "표시 이름", 40) as string,
    body_ko: text(payload.body_ko, "후기 내용", 500) as string,
    completed_work_label: text(payload.completed_work_label, "완료 업무", 120, false),
    review_type: reviewType,
    is_work_verified: reviewType === "verified_member",
    consent_id: reviewType === "verified_member" ? consentId : null,
    is_public: payload.is_public === true,
    sort_order: integer(payload.sort_order ?? 0, "표시 순서", 0, 10000),
    public_starts_at: publicStartsAt,
    public_ends_at: publicEndsAt,
    updated_by: userId
  };
  const query = id
    ? admin.from("landing_reviews").update(row).eq("id", id).select().single()
    : admin.from("landing_reviews").insert(row).select().single();
  const { data, error } = await query;
  if (error || !data) throw new HttpError(400, String(error?.message || "랜딩 후기를 저장하지 못했습니다."));
  return { review: data };
}

async function setLandingVisibility(userId: string, payload: JsonRecord) {
  await requireAnyRole(userId, LANDING_ROLES);
  const id = uuid(payload.id, "콘텐츠");
  const kind = String(payload.kind || "");
  const table = kind === "metric" ? "landing_metric_settings" : kind === "review" ? "landing_reviews" : "";
  if (!table) throw new HttpError(400, "콘텐츠 종류를 확인해 주세요.");
  const { data, error } = await admin.from(table).update({ is_public: payload.is_public === true, updated_by: userId }).eq("id", id).select().single();
  if (error || !data) throw new HttpError(400, String(error?.message || "공개 상태를 저장하지 못했습니다."));
  return { item: data };
}

async function proxyOldAdmin(request: Request, payload: JsonRecord) {
  const authorization = request.headers.get("authorization") || "";
  const apikey = request.headers.get("apikey") || serviceRoleKey;
  const response = await fetch(OLD_ADMIN_URL, {
    method: "POST",
    headers: { Authorization: authorization, apikey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let body: JsonRecord;
  try { body = JSON.parse(raw) as JsonRecord; } catch { body = { ok: false, error: "운영 요청을 처리하지 못했습니다." }; }
  return { status: response.status, body };
}

async function financeWithPhase5(request: Request, userId: string, payload: JsonRecord) {
  const proxied = await proxyOldAdmin(request, payload);
  if (proxied.status >= 400 || proxied.body.ok === false) return proxied;
  const kyc = await hasAnyRole(userId, KYC_ROLES) ? await listKyc(userId) : [];
  return { status: proxied.status, body: { ...proxied.body, kyc } };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    const user = userFromVerifiedJwt(request);
    const payload = await parseRequest(request);
    const action = String(payload.action || "catalog");

    if (action === "list_landing_content") return jsonResponse(request, { ok: true, ...(await listLandingContent(user.id)) });
    if (action === "save_landing_metric") return jsonResponse(request, { ok: true, ...(await saveLandingMetric(user.id, payload)) });
    if (action === "save_landing_review") return jsonResponse(request, { ok: true, ...(await saveLandingReview(user.id, payload)) });
    if (action === "set_landing_visibility") return jsonResponse(request, { ok: true, ...(await setLandingVisibility(user.id, payload)) });

    if (action === "finance" || action === "list_finance") {
      const result = await financeWithPhase5(request, user.id, payload);
      return jsonResponse(request, result.body, result.status);
    }
    if (action === "kyc" || action === "list_kyc") return jsonResponse(request, { ok: true, members: await listKyc(user.id) });
    if (action === "review_kyc") return jsonResponse(request, { ok: true, ...(await reviewKyc(user.id, payload)) });
    if (action === "preview_private_file") return jsonResponse(request, { ok: true, ...(await previewPrivateFile(user.id, payload)) });
    if (action === "preview_kyc_document" || action === "kyc_preview") return jsonResponse(request, { ok: true, ...(await previewKycDocument(user.id, payload)) });
    if (action === "reveal_withdrawal_destination" || action === "reveal_payout_destination") {
      return jsonResponse(request, { ok: true, ...(await revealWithdrawalDestination(user.id, payload)) });
    }

    const proxied = await proxyOldAdmin(request, payload);
    return jsonResponse(request, proxied.body, proxied.status);
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(request, { ok: false, error: error.message, code: error.code || undefined }, error.status);
    console.error("admin-phase5 error", error);
    return jsonResponse(request, { ok: false, error: "운영 요청을 처리하지 못했습니다." }, 500);
  }
});
