// Web Push 발송(VAPID). 구독 만료(410)는 호출 측에서 정리한다.

import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { HttpError } from "./http.ts";

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

export function vapidPublicKey(): string {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  if (!publicKey) throw new HttpError(503, "푸시 알림 설정이 아직 준비되지 않았습니다.");
  return publicKey;
}

function pushUrlForType(notificationType: string): string {
  const type = String(notificationType || "info");
  if (type === "work") return "/?page=nodes";
  if (type === "finance") return "/?page=wallet";
  if (type === "kyc") return "/?page=wallet";
  return "/?page=dashboard";
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

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.notification_id,
    data: {
      url: pushUrlForType(payload.notification_type),
      notification_id: payload.notification_id,
      notification_type: payload.notification_type
    }
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_key }
        },
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
