import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const allAdminRoles = [
  "super_admin",
  "member_support",
  "kyc_review",
  "finance",
  "work_review",
  "content"
] as const;

const contentRoles = ["super_admin", "content"];

function corsHeaders(request: Request): HeadersInit {
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

function jsonResponse(request: Request, body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function assertUuid(value: unknown, label: string): string {
  const candidate = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
  }
  return candidate;
}

function textValue(value: unknown, label: string, max = 240, required = true): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate && !required) return null;
  if (!candidate) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (candidate.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return candidate;
}

function numberValue(value: unknown, label: string, min: number, max: number): number {
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate < min || candidate > max) {
    throw new HttpError(400, `${label}은(는) ${min}~${max} 범위여야 합니다.`);
  }
  return candidate;
}

function catalogStatus(value: unknown): "draft" | "published" | "paused" | "archived" {
  const candidate = String(value || "draft");
  if (!["draft", "published", "paused", "archived"].includes(candidate)) {
    throw new HttpError(400, "공개 상태가 올바르지 않습니다.");
  }
  return candidate as "draft" | "published" | "paused" | "archived";
}

async function authenticate(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "운영자 로그인이 필요합니다.");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "운영자 세션이 만료됐습니다.");
  return data.user;
}

async function requireRole(userId: string, roles: readonly string[]) {
  const { data, error } = await admin.rpc("putduk_admin_has_role", {
    p_user_id: userId,
    p_roles: [...roles]
  });
  if (error) {
    console.error("admin role check failed", error);
    throw new HttpError(503, "운영자 권한을 확인하지 못했습니다.");
  }
  if (data !== true) throw new HttpError(403, "이 메뉴를 사용할 권한이 없습니다.");
}

async function appendAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string | null,
  beforeData: unknown,
  afterData: unknown
) {
  const { error } = await admin.rpc("putduk_admin_append_audit", {
    p_admin_id: adminId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_before: beforeData ?? null,
    p_after: afterData ?? null
  });
  if (error) {
    console.error("admin audit append failed", error);
    throw new HttpError(503, "변경 기록을 남기지 못해 작업을 완료하지 못했습니다.");
  }
}

async function parseRequest(request: Request): Promise<JsonRecord> {
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    throw new HttpError(400, "요청 형식을 확인해 주세요.");
  }
}

async function listCatalog() {
  const [brandResult, nodeResult] = await Promise.all([
    admin
      .from("partner_brands")
      .select("id,slug,display_name_ko,legal_name,category,verification_status,verification_note,logo_asset_path,logo_usage_status,published,created_at,updated_at")
      .order("display_name_ko", { ascending: true }),
    admin
      .from("nodes")
      .select("id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,daily_capacity,enabled,motion_profile,motion_version,supply_source,catalog_status,published_at,published_by,created_at,updated_at")
      .order("created_at", { ascending: false })
  ]);

  if (brandResult.error || nodeResult.error) {
    console.error("catalog read failed", brandResult.error || nodeResult.error);
    throw new HttpError(503, "업무 카탈로그를 불러오지 못했습니다.");
  }

  return { brands: brandResult.data || [], nodes: nodeResult.data || [] };
}

async function getNode(id: string) {
  const { data, error } = await admin.from("nodes").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("node read failed", error);
    throw new HttpError(503, "업무 카드를 불러오지 못했습니다.");
  }
  if (!data) throw new HttpError(404, "업무 카드를 찾을 수 없습니다.");
  return data;
}

async function ensureBrand(id: string) {
  const { data, error } = await admin.from("partner_brands").select("id").eq("id", id).maybeSingle();
  if (error) {
    console.error("brand read failed", error);
    throw new HttpError(503, "협력사 정보를 확인하지 못했습니다.");
  }
  if (!data) throw new HttpError(400, "등록된 협력사를 선택해 주세요.");
}

async function createNode(userId: string, payload: JsonRecord) {
  const partnerBrandId = assertUuid(payload.partner_brand_id, "협력사");
  await ensureBrand(partnerBrandId);

  const title = textValue(payload.title_ko, "업무 이름", 120);
  const description = textValue(payload.description_ko, "업무 설명", 1000);
  const nodeFamily = textValue(payload.node_family, "업무 분류", 80);
  const difficulty = textValue(payload.difficulty || "일반 처리", "난이도", 40);
  const estimatedSeconds = numberValue(payload.estimated_seconds, "예상 처리 시간", 30, 5400);
  const rewardMin = numberValue(payload.reward_min ?? 0, "최소 보상", 0, 100000000);
  const rewardMax = numberValue(payload.reward_max ?? rewardMin, "최대 보상", rewardMin, 100000000);
  const dailyCapacity = numberValue(payload.daily_capacity ?? 0, "하루 처리 한도", 0, 1000000);
  const motionProfile = textValue(payload.motion_profile || "default", "연출 프로필", 80);
  const motionVersion = textValue(payload.motion_version || "1.0.0", "연출 버전", 40);

  const insertPayload = {
    public_id: `PDK-NODE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    partner_brand_id: partnerBrandId,
    title_ko: title,
    description_ko: description,
    node_family: nodeFamily,
    difficulty,
    estimated_seconds: estimatedSeconds,
    reward_min: rewardMin,
    reward_max: rewardMax,
    daily_capacity: dailyCapacity,
    enabled: false,
    motion_profile: motionProfile,
    motion_version: motionVersion,
    supply_source: "operator",
    catalog_status: "draft"
  };

  const { data, error } = await admin.from("nodes").insert(insertPayload).select("*").single();
  if (error || !data) {
    console.error("node create failed", error);
    throw new HttpError(503, "업무 카드를 등록하지 못했습니다.");
  }

  await appendAudit(userId, "업무 카드 등록", "node", data.id, textValue(payload.reason, "사유", 240, false), null, data);
  return data;
}

async function updateNode(userId: string, payload: JsonRecord) {
  const nodeId = assertUuid(payload.node_id, "업무 카드");
  const before = await getNode(nodeId);
  const patch: JsonRecord = {};

  if (payload.partner_brand_id !== undefined) {
    const partnerBrandId = assertUuid(payload.partner_brand_id, "협력사");
    await ensureBrand(partnerBrandId);
    patch.partner_brand_id = partnerBrandId;
  }
  if (payload.title_ko !== undefined) patch.title_ko = textValue(payload.title_ko, "업무 이름", 120);
  if (payload.description_ko !== undefined) patch.description_ko = textValue(payload.description_ko, "업무 설명", 1000);
  if (payload.node_family !== undefined) patch.node_family = textValue(payload.node_family, "업무 분류", 80);
  if (payload.difficulty !== undefined) patch.difficulty = textValue(payload.difficulty, "난이도", 40);
  if (payload.estimated_seconds !== undefined) patch.estimated_seconds = numberValue(payload.estimated_seconds, "예상 처리 시간", 30, 5400);
  if (payload.reward_min !== undefined) patch.reward_min = numberValue(payload.reward_min, "최소 보상", 0, 100000000);
  if (payload.reward_max !== undefined) patch.reward_max = numberValue(payload.reward_max, "최대 보상", Number(patch.reward_min ?? before.reward_min), 100000000);
  if (payload.daily_capacity !== undefined) patch.daily_capacity = numberValue(payload.daily_capacity, "하루 처리 한도", 0, 1000000);
  if (payload.motion_profile !== undefined) patch.motion_profile = textValue(payload.motion_profile, "연출 프로필", 80);
  if (payload.motion_version !== undefined) patch.motion_version = textValue(payload.motion_version, "연출 버전", 40);

  if (payload.catalog_status !== undefined) {
    const status = catalogStatus(payload.catalog_status);
    patch.catalog_status = status;
    patch.enabled = status === "published";
  } else if (payload.enabled !== undefined) {
    if (payload.enabled === true && before.catalog_status !== "published") {
      throw new HttpError(400, "공개 승인된 카드만 켤 수 있습니다.");
    }
    patch.enabled = Boolean(payload.enabled);
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "변경할 항목이 없습니다.");
  }

  const { data, error } = await admin
    .from("nodes")
    .update(patch)
    .eq("id", nodeId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("node update failed", error);
    throw new HttpError(503, "업무 카드 설정을 저장하지 못했습니다.");
  }

  await appendAudit(
    userId,
    "업무 카드 수정",
    "node",
    nodeId,
    textValue(payload.reason, "사유", 240, false),
    before,
    data
  );
  return data;
}

async function updateNodeStatus(userId: string, payload: JsonRecord, status: "published" | "paused" | "archived") {
  const nodeId = assertUuid(payload.node_id, "업무 카드");
  const before = await getNode(nodeId);
  const { data, error } = await admin
    .from("nodes")
    .update({ catalog_status: status, enabled: status === "published" })
    .eq("id", nodeId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("node status update failed", error);
    throw new HttpError(503, "업무 카드 공개 상태를 변경하지 못했습니다.");
  }

  await appendAudit(
    userId,
    status === "published" ? "업무 카드 공개" : status === "paused" ? "업무 카드 일시중지" : "업무 카드 보관",
    "node",
    nodeId,
    textValue(payload.reason, "사유", 240, false),
    before,
    data
  );
  return data;
}

async function listAdminRoles(userId: string) {
  const checks = await Promise.all(allAdminRoles.map(async (role) => {
    const { data, error } = await admin.rpc("putduk_admin_has_role", {
      p_user_id: userId,
      p_roles: [role]
    });
    return error ? null : data === true ? role : null;
  }));
  return checks.filter((role): role is string => Boolean(role));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    const user = await authenticate(request);
    const payload = await parseRequest(request);
    const action = String(payload.action || "catalog");

    if (action === "me") {
      const roles = await listAdminRoles(user.id);
      if (!roles.length) throw new HttpError(403, "운영자 계정이 아닙니다.");
      return jsonResponse(request, {
        ok: true,
        user_id: user.id,
        email: user.email || null,
        roles
      });
    }

    if (action === "catalog" || action === "list_catalog") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, ...(await listCatalog()) });
    }

    if (action === "create_node") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, node: await createNode(user.id, payload) }, 201);
    }

    if (action === "update_node") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, node: await updateNode(user.id, payload) });
    }

    if (action === "publish_node" || action === "pause_node" || action === "archive_node") {
      await requireRole(user.id, contentRoles);
      const status = action === "publish_node" ? "published" : action === "pause_node" ? "paused" : "archived";
      return jsonResponse(request, { ok: true, node: await updateNodeStatus(user.id, payload, status) });
    }

    throw new HttpError(404, "지원하지 않는 운영 메뉴입니다.");
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(request, { ok: false, error: error.message }, error.status);
    console.error("admin-control error", error);
    return jsonResponse(request, { ok: false, error: "운영 요청을 처리하지 못했습니다." }, 500);
  }
});
