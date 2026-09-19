import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders, HttpError, jsonResponse, userFromVerifiedJwt, type JsonRecord } from "../_shared/http.ts";
import { vapidPublicKey } from "../_shared/web-push.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function parseRequest(request: Request): Promise<JsonRecord> {
  if (request.method === "GET" || request.method === "HEAD") {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    throw new HttpError(400, "요청 형식을 확인해 주세요.");
  }
}

function textValue(value: unknown, label: string, max = 2000, required = true): string {
  const candidate = String(value ?? "").trim();
  if (!candidate && !required) return "";
  if (!candidate) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (candidate.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return candidate;
}

async function upsertSubscription(userId: string, payload: JsonRecord) {
  const endpoint = textValue(payload.endpoint, "푸시 주소", 2000);
  const p256dh = textValue(payload.p256dh || payload.key_p256dh, "푸시 키");
  const authKey = textValue(payload.auth_key || payload.key_auth, "푸시 인증 키", 500);
  const userAgent = textValue(payload.user_agent, "기기 정보", 500, false);

  const { data, error } = await admin.rpc("putduk_push_upsert_subscription", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth_key: authKey,
    p_user_agent: userAgent || null
  });
  if (error) {
    console.error("push upsert failed", error);
    throw new HttpError(503, "푸시 알림 등록을 저장하지 못했습니다.");
  }
  return { subscription_id: data };
}

async function removeSubscription(userId: string, payload: JsonRecord) {
  const endpoint = textValue(payload.endpoint, "푸시 주소", 2000, false);
  const { data, error } = await admin.rpc("putduk_push_remove_subscription", {
    p_user_id: userId,
    p_endpoint: endpoint || null
  });
  if (error) {
    console.error("push remove failed", error);
    throw new HttpError(503, "푸시 알림 등록을 해제하지 못했습니다.");
  }
  return { removed: Number(data || 0) };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    const payload = await parseRequest(request);
    const action = String(payload.action || "vapid_public_key");

    if (action === "vapid_public_key") {
      return jsonResponse(request, { ok: true, public_key: vapidPublicKey() });
    }

    const user = userFromVerifiedJwt(request);

    if (action === "subscribe") {
      return jsonResponse(request, { ok: true, ...(await upsertSubscription(user.id, payload)) });
    }

    if (action === "unsubscribe") {
      return jsonResponse(request, { ok: true, ...(await removeSubscription(user.id, payload)) });
    }

    throw new HttpError(404, "지원하지 않는 푸시 요청입니다.");
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, { ok: false, error: error.message }, error.status);
    }
    console.error("member-push error", error);
    return jsonResponse(request, { ok: false, error: "푸시 요청을 처리하지 못했습니다." }, 500);
  }
});
