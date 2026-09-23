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

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function corsHeaders(request: Request): HeadersInit {
  const configured = (Deno.env.get("PUTDUK_ALLOWED_ORIGINS") || "*").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = request.headers.get("origin") || "";
  const allow = configured.includes("*") ? "*" : configured.includes(origin) ? origin : configured[0] || "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function verifiedUserId(request: Request): string {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  const parts = token.split(".");
  if (parts.length < 2) throw new HttpError(401, "세션이 만료됐습니다.");
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: string; exp?: number };
    if (!payload.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub)) {
      throw new HttpError(401, "세션이 만료됐습니다.");
    }
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 5000) throw new HttpError(401, "세션이 만료됐습니다.");
    return payload.sub;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "세션이 만료됐습니다.");
  }
}

function accessToken(request: Request): string {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  return token;
}

async function requireLiveAuthUser(request: Request, userId: string) {
  const { data, error } = await admin.auth.getUser(accessToken(request));
  if (error || !data.user || data.user.id !== userId) throw new HttpError(401, "세션이 유효하지 않습니다.");
  const bannedUntil = data.user.banned_until ? Date.parse(data.user.banned_until) : NaN;
  if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) throw new HttpError(403, "현재 계정으로 이용할 수 없습니다.");
}

function uuid(value: unknown): string {
  const text = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new HttpError(400, "업무 대상을 확인해 주세요.");
  }
  return text;
}

type ActivityRow = { status?: string; node_id?: string; started_at?: string; completed_at?: string; updated_at?: string };

async function realActivitySnapshot(): Promise<JsonRecord> {
  const now = Date.now();
  const since30 = new Date(now - 30 * 60 * 1000).toISOString();
  const since15 = new Date(now - 15 * 60 * 1000).toISOString();
  const [activeResult, startedResult, recentResult] = await Promise.all([
    admin.from("task_runs").select("id", { count: "exact", head: true }).in("status", ["in_progress", "checkpointed"]),
    admin.from("task_runs").select("id", { count: "exact", head: true }).gte("started_at", since15),
    admin.from("task_runs").select("status,node_id,started_at,completed_at,updated_at")
      .in("status", ["in_progress", "checkpointed", "submitted", "review_pending", "approved"])
      .gte("updated_at", since30).order("updated_at", { ascending: false }).limit(4)
  ]);
  if (activeResult.error || startedResult.error || recentResult.error) {
    console.error("real activity query failed", activeResult.error || startedResult.error || recentResult.error);
    throw new HttpError(503, "실제 활동 현황을 불러오지 못했습니다.");
  }
  const rows = (recentResult.data || []) as ActivityRow[];
  const nodeIds = [...new Set(rows.map((row) => String(row.node_id || "")).filter(Boolean))];
  const partnerByNode = new Map<string, string>();
  if (nodeIds.length) {
    const { data: nodeRows, error: nodeError } = await admin.from("nodes").select("id,partner_brand_id").in("id", nodeIds);
    if (nodeError) throw new HttpError(503, "실제 활동 현황을 불러오지 못했습니다.");
    const brandIds = [...new Set((nodeRows || []).map((row) => String(row.partner_brand_id || "")).filter(Boolean))];
    const brandById = new Map<string, string>();
    if (brandIds.length) {
      const { data: brandRows, error: brandError } = await admin.from("partner_brands").select("id,display_name_ko,published").in("id", brandIds).eq("published", true);
      if (brandError) throw new HttpError(503, "실제 활동 현황을 불러오지 못했습니다.");
      for (const row of brandRows || []) brandById.set(String(row.id), String(row.display_name_ko || "협력사"));
    }
    for (const row of nodeRows || []) partnerByNode.set(String(row.id), brandById.get(String(row.partner_brand_id || "")) || "협력사");
  }
  const events = rows.map((row) => {
    const status = String(row.status || "");
    const action = status === "approved" ? "업무 승인이 완료됐어요"
      : ["submitted", "review_pending"].includes(status) ? "업무를 제출했어요" : "업무를 시작했어요";
    return { action, partner: partnerByNode.get(String(row.node_id || "")) || "협력사", occurred_at: row.completed_at || row.updated_at || row.started_at || null };
  });
  return { available: true, active_count: activeResult.count || 0, started_15m: startedResult.count || 0, events, measured_at: new Date(now).toISOString() };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "요청 형식을 확인해 주세요." }, 405);

  try {
    const userId = verifiedUserId(request);
    await requireLiveAuthUser(request, userId);
    let payload: JsonRecord = {};
    try { payload = await request.json() as JsonRecord; } catch (_) {}
    const action = String(payload.action || "member_experience");

    if (action === "member_experience") {
      const { data, error } = await admin.rpc("putduk_member_experience_snapshot", { p_user_id: userId });
      if (error || !data || typeof data !== "object") {
        console.error("member experience snapshot failed", error);
        throw new HttpError(503, "업무 현황을 불러오지 못했습니다.");
      }
      return json(request, { ok: true, ...(data as JsonRecord) });
    }

    if (action === "real_activity") {
      return json(request, { ok: true, activity: await realActivitySnapshot() });
    }

    if (action === "work_contract") {
      const taskRunId = uuid(payload.task_run_id);
      const { data, error } = await admin.rpc("putduk_member_work_contract", {
        p_user_id: userId,
        p_task_run_id: taskRunId
      });
      if (error) {
        console.error("member work contract failed", error);
        throw new HttpError(409, "업무 화면을 불러오지 못했습니다.");
      }
      return json(request, { ok: true, contract_data: data || { available: false } });
    }

    if (action === "submit_work") {
      const taskRunId = uuid(payload.task_run_id);
      const submission = payload.submission;
      if (!submission || typeof submission !== "object" || Array.isArray(submission)) {
        throw new HttpError(400, "제출 내용을 확인해 주세요.");
      }
      const { data, error } = await admin.rpc("putduk_member_submit_work_v2", {
        p_user_id: userId,
        p_task_run_id: taskRunId,
        p_submission: submission
      });
      if (error) {
        console.error("generic member submit failed", error);
        throw new HttpError(409, "업무를 제출하지 못했습니다.");
      }
      if (!data || typeof data !== "object") throw new HttpError(503, "업무 제출 결과를 확인하지 못했습니다.");
      return json(request, data as JsonRecord);
    }

    throw new HttpError(400, "요청 형식을 확인해 주세요.");
  } catch (error) {
    if (error instanceof HttpError) return json(request, { ok: false, error: error.message }, error.status);
    console.error("member-experience error", error);
    return json(request, { ok: false, error: "요청을 처리하지 못했습니다." }, 500);
  }
});
