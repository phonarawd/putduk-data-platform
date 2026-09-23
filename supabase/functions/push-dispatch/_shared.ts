import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

export type JsonRecord = Record<string, unknown>;

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-dispatch-secret",
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

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export type PushPayload = {
  notification_id: string;
  user_id: string;
  title: string;
  body: string;
  notification_type: string;
};

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:putduk.operator@gmail.com";
  if (!publicKey || !privateKey) {
    throw new HttpError(503, "푸시 알림 설정이 아직 준비되지 않았습니다.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

export async function dispatchPushToUser(admin: SupabaseClient, payload: PushPayload) {
  ensureVapid();

  const { data, error } = await admin.rpc("putduk_push_list_subscriptions", {
    p_user_id: payload.user_id
  });
  if (error) {
    console.error("push subscriptions load failed", error);
    throw new HttpError(503, "푸시 구독을 불러오지 못했습니다.");
  }

  const rows = (Array.isArray(data) ? data : []) as PushSubscriptionRow[];
  if (!rows.length) return { sent: 0, removed: 0, failed: 0 };

  const type = String(payload.notification_type || "info");
  const url = type === "work" ? "/?page=nodes" : type === "finance" || type === "kyc" ? "/?page=wallet" : "/?page=dashboard";
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.notification_id,
    data: { url, notification_id: payload.notification_id, notification_type: type }
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
        message,
        { TTL: 86400 }
      );
      sent += 1;
    } catch (err) {
      const status = Number((err as { statusCode?: number })?.statusCode || 0);
      if (status === 404 || status === 410) {
        const { error: removeError } = await admin.rpc("putduk_push_remove_subscription", {
          p_user_id: payload.user_id,
          p_endpoint: row.endpoint
        });
        if (removeError) {
          console.error("push subscription remove failed", removeError);
          failed += 1;
          continue;
        }
        removed += 1;
        continue;
      }
      console.error("push send failed", row.endpoint, err);
      failed += 1;
    }
  }

  return { sent, removed, failed };
}
