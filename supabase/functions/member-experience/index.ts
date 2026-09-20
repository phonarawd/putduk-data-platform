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
  const configured = (Deno.env.get("PUTDUK_ALLOWED_ORIGINS") || "*").split(",").map((v) => v.trim()).filter(Boolean);
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, error: "요청 형식을 확인해 주세요." }, 405);
  try {
    const userId = verifiedUserId(request);
    let payload: JsonRecord = {};
    try { payload = await request.json() as JsonRecord; } catch (_) {}
    const action = String(payload.action || "member_experience");
    if (action !== "member_experience") throw new HttpError(400, "요청 형식을 확인해 주세요.");

    const { data, error } = await admin.rpc("putduk_member_experience_snapshot", { p_user_id: userId });
    if (error || !data || typeof data !== "object") {
      console.error("member experience snapshot failed", error);
      throw new HttpError(503, "업무 현황을 불러오지 못했습니다.");
    }
    return json(request, { ok: true, ...(data as JsonRecord) });
  } catch (error) {
    if (error instanceof HttpError) return json(request, { ok: false, error: error.message }, error.status);
    console.error("member-experience error", error);
    return json(request, { ok: false, error: "업무 현황을 불러오지 못했습니다." }, 500);
  }
});
