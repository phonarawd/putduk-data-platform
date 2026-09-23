import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders, HttpError, jsonResponse, dispatchPushToUser, type JsonRecord, type PushPayload } from "./_shared.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const dispatchSecret = Deno.env.get("PUTDUK_PUSH_DISPATCH_SECRET");

if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertDispatchAuth(request: Request) {
  const configured = String(dispatchSecret || "").trim();
  if (!configured) throw new HttpError(503, "푸시 발송 설정이 아직 준비되지 않았습니다.");
  const header = String(request.headers.get("x-push-dispatch-secret") || "").trim();
  if (!header || header !== configured) throw new HttpError(401, "푸시 발송 권한이 없습니다.");
}

async function parseRequest(request: Request): Promise<JsonRecord> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    throw new HttpError(400, "요청 형식을 확인해 주세요.");
  }
}

function payloadFromBody(body: JsonRecord): PushPayload {
  const notificationId = String(body.notification_id || "").trim();
  const userId = String(body.user_id || "").trim();
  if (!UUID_RE.test(notificationId) || !UUID_RE.test(userId)) {
    throw new HttpError(400, "알림 정보 형식이 올바르지 않습니다.");
  }
  const title = String(body.title || "").trim();
  const messageBody = String(body.body || "").trim();
  if (!title || !messageBody) throw new HttpError(400, "알림 내용이 비어 있습니다.");
  return {
    notification_id: notificationId,
    user_id: userId,
    title,
    body: messageBody,
    notification_type: String(body.notification_type || "info")
  };
}

type AuthorizedPush = {
  payload: PushPayload;
  dispatchToken: string;
};

async function authorizeDispatch(payload: PushPayload): Promise<AuthorizedPush> {
  const { data, error } = await admin.rpc("putduk_push_authorize_dispatch", {
    p_notification_id: payload.notification_id,
    p_user_id: payload.user_id,
    p_title: payload.title,
    p_body: payload.body,
    p_notification_type: payload.notification_type
  });
  if (error) {
    console.error("push outbox authorization failed", error);
    throw new HttpError(503, "푸시 발송 대상을 확인하지 못했습니다.");
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !row.dispatch_token) {
    throw new HttpError(409, "푸시 발송 요청이 이미 처리되었거나 알림 정보가 일치하지 않습니다.");
  }
  return {
    payload: {
      notification_id: payload.notification_id,
      user_id: String(row.user_id),
      title: String(row.title),
      body: String(row.body),
      notification_type: String(row.notification_type || "info")
    },
    dispatchToken: String(row.dispatch_token)
  };
}

async function markOutboxDispatched(notificationId: string, dispatchToken: string, sent: number, removed: number, lastError: string | null) {
  const { error } = await admin.rpc("putduk_push_mark_outbox_dispatched", {
    p_notification_id: notificationId,
    p_dispatch_token: dispatchToken,
    p_last_error: lastError
  });
  if (error) console.error("push outbox update failed", error, { notificationId, sent, removed });
}

async function markOutboxFailed(notificationId: string, dispatchToken: string, lastError: string) {
  const { error } = await admin.rpc("putduk_push_mark_outbox_failed", {
    p_notification_id: notificationId,
    p_dispatch_token: dispatchToken,
    p_last_error: lastError
  });
  if (error) console.error("push outbox failure update failed", error, { notificationId });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    assertDispatchAuth(request);
    const body = await parseRequest(request);
    const payload = payloadFromBody(body);
    const authorized = await authorizeDispatch(payload);
    const result = await dispatchPushToUser(admin, authorized.payload);
    if (result.failed > 0) {
      await markOutboxFailed(authorized.payload.notification_id, authorized.dispatchToken, "push_delivery_failed");
      throw new HttpError(503, "푸시 발송이 완료되지 않았습니다.");
    }
    await markOutboxDispatched(
      authorized.payload.notification_id,
      authorized.dispatchToken,
      result.sent,
      result.removed,
      result.sent === 0 && result.removed === 0 ? "no_active_subscriptions" : null
    );
    return jsonResponse(request, { ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, { ok: false, error: error.message }, error.status);
    }
    console.error("push-dispatch error", error);
    return jsonResponse(request, { ok: false, error: "푸시 발송을 처리하지 못했습니다." }, 500);
  }
});
