import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders, HttpError, jsonResponse, type JsonRecord, userFromVerifiedJwt } from "../_shared/http.ts";
import { isOwnStoragePath, isUuid, PRIVATE_BUCKET, SIGNED_URL_SECONDS } from "../_shared/validate.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ALLOWED_ROLES = ["super_admin", "member_support"];

function ownerFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (isUuid(parts[0])) return parts[0];
  if (["kyc", "deposit-proof", "deposit_proof"].includes(parts[0]) && isUuid(parts[1])) return parts[1];
  return null;
}

async function requireAdmin(userId: string) {
  const { data, error } = await admin.rpc("putduk_admin_has_role", { p_user_id: userId, p_roles: ALLOWED_ROLES });
  if (error) {
    console.error("admin work asset role failed", error);
    throw new HttpError(503, "운영자 권한을 확인하지 못했습니다.");
  }
  if (data !== true) throw new HttpError(403, "이 자료를 볼 권한이 없습니다.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  try {
    if (request.method !== "POST") throw new HttpError(405, "지원하지 않는 요청입니다.");
    const user = userFromVerifiedJwt(request);
    await requireAdmin(user.id);
    let payload: JsonRecord = {};
    try {
      const parsed = await request.json();
      payload = parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
    } catch {
      throw new HttpError(400, "요청 형식을 확인해 주세요.");
    }
    const path = String(payload.path || "").trim();
    const ownerId = ownerFromPath(path);
    if (!ownerId || !isOwnStoragePath(ownerId, path)) throw new HttpError(400, "회원 증빙 경로를 확인해 주세요.");
    const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      console.error("admin work asset signed url failed", error);
      throw new HttpError(503, "증빙 이미지를 불러오지 못했습니다.");
    }
    return jsonResponse(request, { ok: true, asset: { path, url: data.signedUrl, expires_in: SIGNED_URL_SECONDS } });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "증빙 이미지를 불러오지 못했습니다.";
    if (!(error instanceof HttpError)) console.error("admin-work-asset failed", error);
    return jsonResponse(request, { ok: false, error: message }, status);
  }
});