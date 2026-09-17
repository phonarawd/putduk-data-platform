// 운영자 회원·입출금·KYC·추천·배정 처리. JWT 역할은 호출 전에 확인한다.

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { HttpError, rpcMessage, type JsonRecord } from "./http.ts";
import { isOwnStoragePath, PRIVATE_BUCKET, SIGNED_URL_SECONDS } from "./validate.ts";

const memberRoles = ["super_admin", "member_support"] as const;
const financeRoles = ["super_admin", "finance"] as const;
const kycRoles = ["super_admin", "kyc_review"] as const;
const contentRoles = ["super_admin", "content"] as const;
const assignRoles = ["super_admin", "member_support", "content"] as const;
const referralRoles = ["super_admin", "finance", "member_support"] as const;
const allAdminRoles = [
  "super_admin",
  "member_support",
  "kyc_review",
  "finance",
  "work_review",
  "content"
] as const;

type AdminClient = SupabaseClient;

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

function slugValue(value: unknown): string {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, "영문 소문자·숫자·하이픈으로 된 식별값을 입력해 주세요.");
  }
  return slug;
}

function optionalIso(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const candidate = new Date(String(value));
  if (Number.isNaN(candidate.getTime())) throw new HttpError(400, `${label} 시각이 올바르지 않습니다.`);
  return candidate.toISOString();
}

export async function requireRole(admin: AdminClient, userId: string, roles: readonly string[]) {
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

export async function appendAudit(
  admin: AdminClient,
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

async function callRpc<T>(
  admin: AdminClient,
  name: string,
  args: Record<string, unknown>,
  fallback: string
): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error || data == null) {
    console.error(`${name} failed`, error);
    throw new HttpError(400, rpcMessage(error, fallback));
  }
  return data as T;
}

function amountValue(value: unknown, label: string, min = 1, max = 100_000_000): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    throw new HttpError(400, `${label}을(를) 확인해 주세요.`);
  }
  return Math.round(amount * 100) / 100;
}

function currencyValue(value: unknown): string {
  const currency = String(value || "KRW").trim().toUpperCase();
  if (currency !== "KRW" && currency !== "USDT") {
    throw new HttpError(400, "통화를 확인해 주세요.");
  }
  return currency;
}

function normalizeAdjustDirection(value: unknown): "credit" | "debit" {
  const raw = String(value || "").trim().toLowerCase();
  if (["credit", "입금", "deposit"].includes(raw)) return "credit";
  if (["debit", "차감", "withdraw", "withdrawal"].includes(raw)) return "debit";
  throw new HttpError(400, "잔액 입금 또는 차감을 선택해 주세요.");
}

async function optionalList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) return [];
    throw error;
  }
}

async function attachMemberLabels(
  admin: AdminClient,
  rows: JsonRecord[],
  userIdKey = "user_id"
): Promise<JsonRecord[]> {
  const ids = [...new Set(rows.map((row) => String(row[userIdKey] || "")).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await admin.from("profiles").select("id,public_id,display_name").in("id", ids);
  if (error) {
    console.error("member labels failed", error);
    return rows;
  }
  const map = new Map((data || []).map((row) => [row.id, row]));
  return rows.map((row) => {
    const profile = map.get(String(row[userIdKey] || ""));
    return {
      ...row,
      member_name: profile?.display_name || row.member_name || null,
      member_public_id: profile?.public_id || row.member_public_id || null
    };
  });
}

export async function listMembers(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const limit = Number(payload.limit);
  const offset = Number(payload.offset);
  const { data, error } = await admin.rpc("putduk_admin_search_members", {
    p_admin_id: userId,
    p_query: textValue(payload.query, "검색어", 120, false),
    p_limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 100) : 50,
    p_offset: Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
  });
  if (error) {
    console.error("putduk_admin_search_members failed", error);
    throw new HttpError(400, rpcMessage(error, "회원 정보를 불러오고 있어요."));
  }
  return Array.isArray(data) ? data : [];
}

export async function getMember(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");

  const [profileResult, privateResult, walletResult, taskResult, depositResult, withdrawalResult, kycResult, referralResult, assignResult] = await Promise.all([
    admin.from("profiles").select("id,public_id,display_name,member_tier,status,kyc_status,referral_code,created_at,updated_at").eq("id", memberId).maybeSingle(),
    admin.schema("private").from("profile_private").select("legal_name,birth_date,phone_e164,email_snapshot,last_login_at,last_login_ip,marketing_opt_in").eq("user_id", memberId).maybeSingle(),
    admin.from("wallet_accounts").select("bucket,currency,available_amount,held_amount,updated_at").eq("user_id", memberId),
    admin.from("task_runs").select("id,public_id,node_id,status,reward_amount,reward_status,created_at,completed_at").eq("user_id", memberId).order("created_at", { ascending: false }).limit(40),
    admin.from("deposit_requests").select("id,public_id,currency,amount,status,created_at,reviewed_at,rejection_reason").eq("user_id", memberId).order("created_at", { ascending: false }).limit(40),
    admin.from("withdrawal_requests").select("id,public_id,currency,amount,status,destination_type,destination_masked,transaction_reference,created_at,rejection_reason").eq("user_id", memberId).order("created_at", { ascending: false }).limit(40),
    admin.schema("private").from("kyc_documents").select("id,document_kind,status,reviewed_at,rejection_reason,created_at").eq("user_id", memberId),
    admin.from("referral_relations").select("id,referrer_id,invitee_id,status,created_at").or(`referrer_id.eq.${memberId},invitee_id.eq.${memberId}`),
    admin.from("task_assignments").select("id,node_id,partner_brand_id,reward_amount,estimated_seconds,reason,status,visible_from,visible_until,created_at").eq("user_id", memberId).order("created_at", { ascending: false }).limit(20)
  ]);

  if (profileResult.error || !profileResult.data) {
    throw new HttpError(404, "회원 정보를 찾을 수 없습니다.");
  }

  const authUser = await admin.auth.admin.getUserById(memberId);
  const auth = authUser.data?.user || null;

  return {
    profile: profileResult.data,
    private_profile: privateResult.data || null,
    wallets: walletResult.data || [],
    task_runs: taskResult.data || [],
    deposits: depositResult.data || [],
    withdrawals: withdrawalResult.data || [],
    kyc_documents: kycResult.data || [],
    referrals: referralResult.data || [],
    assignments: assignResult.data || [],
    auth: {
      email: auth?.email || null,
      last_sign_in_at: auth?.last_sign_in_at || null
    }
  };
}

export async function listMemberActivity(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const [events, audits, notifications] = await Promise.all([
    admin.from("task_events").select("id,task_run_id,event_type,event_payload,created_at").eq("user_id", memberId).order("created_at", { ascending: false }).limit(50),
    admin.schema("private").from("admin_audit_logs").select("id,action,target_type,target_id,reason,created_at").eq("target_id", memberId).order("created_at", { ascending: false }).limit(30),
    admin.from("notifications").select("id,title,body,notification_type,created_at,read_at").eq("user_id", memberId).order("created_at", { ascending: false }).limit(30)
  ]);

  return {
    task_events: events.data || [],
    audits: audits.data || [],
    notifications: notifications.data || []
  };
}

export async function setMemberStatus(admin: AdminClient, userId: string, payload: JsonRecord, nextStatus: "blocked" | "active") {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  if (memberId === userId && nextStatus === "blocked") {
    throw new HttpError(400, "운영자 본인 계정은 차단할 수 없습니다.");
  }
  const reason = textValue(payload.reason, "사유", 500, nextStatus === "blocked");

  const before = await admin.from("profiles").select("*").eq("id", memberId).maybeSingle();
  if (before.error || !before.data) throw new HttpError(404, "회원 정보를 찾을 수 없습니다.");

  const { data, error } = await admin
    .from("profiles")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .select("id,public_id,display_name,status,member_tier,kyc_status")
    .single();

  if (error || !data) throw new HttpError(503, "회원 상태를 변경하지 못했습니다.");

  if (nextStatus === "blocked") {
    try {
      await admin.auth.admin.updateUserById(memberId, { ban_duration: "876000h" });
    } catch (authError) {
      console.error("member ban failed", authError);
    }
  } else {
    try {
      await admin.auth.admin.updateUserById(memberId, { ban_duration: "none" });
    } catch (authError) {
      console.error("member unban failed", authError);
    }
  }

  await appendAudit(
    admin,
    userId,
    nextStatus === "blocked" ? "회원 차단" : "회원 차단 해제",
    "profile",
    memberId,
    reason,
    before.data,
    data
  );
  return data;
}

export async function changeMemberTier(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const tier = textValue(payload.member_tier, "회원 등급", 40);
  const before = await admin.from("profiles").select("*").eq("id", memberId).maybeSingle();
  if (!before.data) throw new HttpError(404, "회원 정보를 찾을 수 없습니다.");

  const { data, error } = await admin
    .from("profiles")
    .update({ member_tier: tier, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .select("id,public_id,display_name,member_tier,status")
    .single();
  if (error || !data) throw new HttpError(503, "회원 등급을 변경하지 못했습니다.");

  await appendAudit(admin, userId, "회원 등급 변경", "profile", memberId, textValue(payload.reason, "사유", 240, false), before.data, data);
  return data;
}

export async function resetMemberPassword(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(memberId);
  if (userError || !userData.user?.email) throw new HttpError(404, "회원 이메일을 확인할 수 없습니다.");

  const email = userData.user.email;
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email
  });
  const generated = !link.error && Boolean(link.data?.user?.id || link.data?.properties);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let sent = false;
  if (supabaseUrl && serviceRoleKey) {
    const recover = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
    sent = recover.ok;
    if (!recover.ok) {
      const detail = await recover.text().catch(() => "");
      console.error("password recover failed", recover.status, detail.slice(0, 200));
    }
  }

  if (!sent && !generated) {
    throw new HttpError(400, "이 이메일로는 재설정 안내를 만들 수 없습니다. 인증 메일 설정을 확인해 주세요.");
  }

  await appendAudit(
    admin,
    userId,
    "회원 비밀번호 재설정",
    "profile",
    memberId,
    textValue(payload.reason, "사유", 240, false),
    { email },
    { sent, generated }
  );
  return { sent, generated };
}

export async function notifyMember(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const title = textValue(payload.title, "알림 제목", 80);
  const body = textValue(payload.body, "알림 내용", 500);
  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: memberId,
      title,
      body,
      notification_type: textValue(payload.notification_type || "admin", "알림 종류", 40)
    })
    .select("id,user_id,title,body,notification_type,created_at")
    .single();
  if (error || !data) throw new HttpError(503, "회원 알림을 저장하지 못했습니다.");
  await appendAudit(admin, userId, "특정 회원 알림", "notification", data.id, null, null, data);
  return data;
}

export async function broadcastNotice(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, memberRoles);
  const title = textValue(payload.title, "알림 제목", 80);
  const body = textValue(payload.body, "알림 내용", 500);
  const { data: members, error: memberError } = await admin.from("profiles").select("id");
  if (memberError) throw new HttpError(503, "회원 목록을 불러오지 못했습니다.");
  const rows = (members || []).map((row) => ({
    user_id: row.id,
    title,
    body,
    notification_type: textValue(payload.notification_type || "broadcast", "알림 종류", 40)
  }));
  if (!rows.length) throw new HttpError(400, "공지를 받을 회원이 없습니다.");

  const { data, error } = await admin
    .from("notifications")
    .insert(rows)
    .select("id,user_id,title,created_at");
  if (error || !data?.length) throw new HttpError(503, "전체 공지를 저장하지 못했습니다.");
  await appendAudit(admin, userId, "전체 공지", "notification", data[0].id, null, null, { count: data.length, title });
  return { count: data.length };
}

export async function createOperatorDeposit(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const amount = amountValue(payload.amount ?? 1000, "금액", 1000);
  const currency = currencyValue(payload.currency);
  const note = textValue(payload.note || payload.reason || "운영자 검증 입금", "메모", 500);
  const insertPayload = {
    public_id: `PDK-DEP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    user_id: memberId,
    currency,
    amount,
    status: "submitted",
    note,
    proof_path: textValue(payload.proof_path, "입금 증빙", 500, false)
  };
  const { data, error } = await admin.from("deposit_requests").insert(insertPayload).select("*").single();
  if (error || !data) {
    console.error("operator deposit create failed", error);
    throw new HttpError(503, "처리 대기 입금을 만들지 못했습니다.");
  }
  await appendAudit(admin, userId, "운영자 입금 대기 생성", "deposit_request", data.id, note, null, data);
  return data;
}

export async function createReviewRun(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, ["super_admin", "work_review", "content"]);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const nodeId = assertUuid(payload.node_id, "업무 카드");
  const node = await admin.from("nodes").select("id,title_ko,reward_min,reward_max").eq("id", nodeId).maybeSingle();
  if (node.error || !node.data) throw new HttpError(404, "업무 카드를 찾을 수 없습니다.");
  const reward = Number(payload.reward_amount ?? node.data.reward_min ?? 0);
  const seed = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((value) => value.toString(16).padStart(2, "0")).join("");
  const insertPayload = {
    public_id: `PDK-RUN-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    user_id: memberId,
    node_id: nodeId,
    status: "submitted",
    progress: 1,
    completed_at: new Date().toISOString(),
    motion_variant: "a",
    motion_seed: seed,
    reward_amount: Number.isFinite(reward) ? Math.max(0, reward) : 0,
    reward_status: "pending"
  };
  const { data, error } = await admin.from("task_runs").insert(insertPayload).select("*").single();
  if (error || !data) {
    console.error("review run create failed", error);
    throw new HttpError(503, "검수 대상 업무를 만들지 못했습니다.");
  }
  await appendAudit(admin, userId, "검수 대상 생성", "task_run", data.id, textValue(payload.reason, "사유", 240, false), null, data);
  return data;
}

export async function assignTask(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, assignRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_assign_task", {
    p_admin_id: userId,
    p_user_id: assertUuid(payload.user_id || payload.member_id, "회원"),
    p_node_id: assertUuid(payload.node_id, "업무 카드"),
    p_reward_amount: payload.reward_amount === undefined || payload.reward_amount === "" ? null : Number(payload.reward_amount),
    p_estimated_seconds: payload.estimated_seconds === undefined || payload.estimated_seconds === "" ? null : Number(payload.estimated_seconds),
    p_reason: textValue(payload.reason, "배정 사유", 500, false),
    p_visible_from: optionalIso(payload.visible_from, "노출 시작"),
    p_visible_until: optionalIso(payload.visible_until, "노출 종료"),
    p_notify: payload.notify === undefined ? true : Boolean(payload.notify)
  }, "업무를 배정하지 못했습니다.");
  await appendAudit(admin, userId, "특정 회원 업무 배정", "task_assignment", String(data.id || ""), textValue(payload.reason, "배정 사유", 500, false), null, data);
  return data;
}

export async function cancelAssignment(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, assignRoles);
  const assignmentId = assertUuid(payload.assignment_id, "배정");
  const before = await admin.from("task_assignments").select("*").eq("id", assignmentId).maybeSingle();
  if (!before.data) throw new HttpError(404, "배정 정보를 찾을 수 없습니다.");
  if (before.data.status !== "active") throw new HttpError(400, "진행 전 배정만 취소할 수 있습니다.");

  const { data, error } = await admin
    .from("task_assignments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("*")
    .single();
  if (error || !data) throw new HttpError(503, "배정을 취소하지 못했습니다.");
  await appendAudit(admin, userId, "업무 배정 취소", "task_assignment", assignmentId, textValue(payload.reason, "사유", 240, false), before.data, data);
  return data;
}

export async function createBrand(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, contentRoles);
  const insertPayload = {
    slug: slugValue(payload.slug),
    display_name_ko: textValue(payload.display_name_ko, "협력사 이름", 80),
    legal_name: textValue(payload.legal_name, "법인명", 160),
    category: textValue(payload.category, "분야", 80),
    description_ko: textValue(payload.description_ko, "한국어 설명", 2000, false),
    verification_status: "pending",
    logo_usage_status: "not_submitted",
    published: false
  };

  const { data, error } = await admin.from("partner_brands").insert(insertPayload).select("*").single();
  if (error || !data) {
    console.error("brand create failed", error);
    throw new HttpError(503, "협력사를 등록하지 못했습니다.");
  }

  const sourceUrl = textValue(payload.source_url, "자료 URL", 500, false);
  const evidencePath = textValue(payload.evidence_path, "증빙 파일", 500, false);
  if (sourceUrl || evidencePath) {
    await admin.schema("private").from("brand_verification_records").insert({
      partner_brand_id: data.id,
      source_kind: textValue(payload.source_kind || "operator", "자료 종류", 40),
      source_url: sourceUrl,
      evidence_path: evidencePath,
      notes: textValue(payload.verification_note, "확인 메모", 1000, false)
    });
  }

  await appendAudit(admin, userId, "협력사 등록", "partner_brand", data.id, null, null, data);
  return data;
}

export async function updateBrandProfile(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, contentRoles);
  const brandId = assertUuid(payload.brand_id, "협력사");
  const before = await admin.from("partner_brands").select("*").eq("id", brandId).maybeSingle();
  if (!before.data) throw new HttpError(404, "협력사를 찾을 수 없습니다.");

  const patch: JsonRecord = {};
  if (payload.display_name_ko !== undefined) patch.display_name_ko = textValue(payload.display_name_ko, "협력사 이름", 80);
  if (payload.legal_name !== undefined) patch.legal_name = textValue(payload.legal_name, "법인명", 160);
  if (payload.category !== undefined) patch.category = textValue(payload.category, "분야", 80);
  if (payload.description_ko !== undefined) patch.description_ko = textValue(payload.description_ko, "한국어 설명", 2000, false);
  if (payload.slug !== undefined) patch.slug = slugValue(payload.slug);
  if (Object.keys(patch).length === 0) throw new HttpError(400, "변경할 항목이 없습니다.");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin.from("partner_brands").update(patch).eq("id", brandId).select("*").single();
  if (error || !data) throw new HttpError(503, "협력사 설정을 저장하지 못했습니다.");
  await appendAudit(admin, userId, "협력사 정보 수정", "partner_brand", brandId, textValue(payload.reason, "사유", 240, false), before.data, data);
  return data;
}

export async function upsertBrandEvidence(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, contentRoles);
  const brandId = assertUuid(payload.brand_id, "협력사");
  const expiresAt = optionalIso(payload.expires_at, "만료일");
  const insertPayload = {
    partner_brand_id: brandId,
    source_kind: textValue(payload.source_kind || "operator", "자료 종류", 40),
    source_url: textValue(payload.source_url, "자료 URL", 500, false),
    evidence_path: textValue(payload.evidence_path, "증빙 파일", 500, false),
    notes: textValue(payload.verification_note || payload.notes, "확인 메모", 1000, false),
    verified_by: userId,
    verified_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  const { data, error } = await admin.schema("private").from("brand_verification_records").insert(insertPayload).select("id,partner_brand_id,source_kind,created_at");
  if (error) {
    console.error("brand evidence insert failed", error);
    throw new HttpError(503, "협력 자료를 저장하지 못했습니다.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  await appendAudit(admin, userId, "협력 자료 등록", "brand_verification", row?.id || brandId, insertPayload.notes, null, row || insertPayload);
  return row || insertPayload;
}

export async function listBrandEvidence(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, contentRoles);
  const brandId = assertUuid(payload.brand_id, "협력사");
  const { data, error } = await admin
    .schema("private")
    .from("brand_verification_records")
    .select("id,source_kind,source_url,evidence_path,verified_by,verified_at,expires_at,notes,created_at")
    .eq("partner_brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(503, "협력 자료를 불러오지 못했습니다.");
  return data || [];
}

export async function listDeposits(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, financeRoles);
  const { data, error } = await admin
    .from("deposit_requests")
    .select("id,public_id,user_id,currency,amount,status,proof_path,note,rejection_reason,created_at,reviewed_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new HttpError(503, "입금내역을 불러오지 못했습니다.");
  return data || [];
}

export async function listWithdrawals(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, financeRoles);
  const { data, error } = await admin
    .from("withdrawal_requests")
    .select("id,public_id,user_id,currency,amount,destination_type,destination_label,destination_masked,status,transaction_reference,rejection_reason,created_at,reviewed_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new HttpError(503, "출금내역을 불러오지 못했습니다.");
  return data || [];
}

export async function reviewDeposit(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_review_deposit", {
    p_admin_id: userId,
    p_deposit_id: assertUuid(payload.deposit_id || payload.request_id, "입금"),
    p_decision: textValue(payload.decision, "처리 결과", 20),
    p_reason: textValue(payload.reason, "사유", 500, false)
  }, "입금 처리를 저장하지 못했습니다.");
  await appendAudit(admin, userId, "입금 처리", "deposit_request", String(data.id || ""), textValue(payload.reason, "사유", 500, false), null, data);
  return data;
}

export async function reviewWithdrawal(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_review_withdrawal", {
    p_admin_id: userId,
    p_withdrawal_id: assertUuid(payload.withdrawal_id || payload.request_id, "출금"),
    p_decision: textValue(payload.decision, "처리 결과", 20),
    p_reason: textValue(payload.reason, "사유", 500, false),
    p_transaction_reference: textValue(payload.transaction_reference, "거래번호", 120, false)
  }, "출금 처리를 저장하지 못했습니다.");
  await appendAudit(admin, userId, "출금 처리", "withdrawal_request", String(data.id || ""), textValue(payload.reason, "사유", 500, false), null, data);
  return data;
}

export async function listFinance(admin: AdminClient, userId: string) {
  const [deposits, withdrawals, kyc, referrals] = await Promise.all([
    optionalList(() => listDeposits(admin, userId)),
    optionalList(() => listWithdrawals(admin, userId)),
    optionalList(() => listKyc(admin, userId)),
    optionalList(() => listReferrals(admin, userId))
  ]);
  return {
    deposits: await attachMemberLabels(admin, deposits as JsonRecord[]),
    withdrawals: await attachMemberLabels(admin, withdrawals as JsonRecord[]),
    kyc: (kyc as JsonRecord[]).map((row) => ({
      ...row,
      user_id: row.id || row.user_id,
      member_name: row.display_name || row.member_name || null,
      member_public_id: row.public_id || row.member_public_id || null
    })),
    referrals: await attachMemberLabels(admin, referrals as JsonRecord[], "invitee_id")
  };
}

export async function adjustMemberBalance(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id, "회원");
  const direction = normalizeAdjustDirection(payload.direction);
  const amount = amountValue(payload.amount, "금액");
  const currency = currencyValue(payload.currency);
  const reason = textValue(payload.reason, "사유", 500);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_adjust_balance", {
    p_admin_id: userId,
    p_user_id: memberId,
    p_direction: direction,
    p_amount: amount,
    p_currency: currency,
    p_reason: reason
  }, "잔액 조정을 저장하지 못했습니다.");
  await appendAudit(
    admin,
    userId,
    direction === "credit" ? "잔액 입금" : "잔액 차감",
    "wallet_account",
    memberId,
    reason,
    null,
    data
  );
  return data;
}

export async function listKyc(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, kycRoles);
  const { data, error } = await admin
    .from("profiles")
    .select("id,public_id,display_name,kyc_status,status,created_at")
    .neq("kyc_status", "pending")
    .order("updated_at", { ascending: false })
    .limit(120);
  if (error) throw new HttpError(503, "본인확인 목록을 불러오지 못했습니다.");
  return data || [];
}

export async function reviewKyc(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, kycRoles);
  const memberId = assertUuid(payload.user_id || payload.member_id || payload.document_id, "회원");
  const decision = textValue(payload.decision, "처리 결과", 20);
  const data = await callRpc<string>(admin, "putduk_admin_review_kyc", {
    p_admin_id: userId,
    p_user_id: memberId,
    p_decision: decision,
    p_reason: textValue(payload.reason, "사유", 500, false)
  }, "본인확인 처리를 저장하지 못했습니다.");
  await appendAudit(admin, userId, "본인확인 처리", "kyc", memberId, textValue(payload.reason, "사유", 500, false), null, { decision: data });
  return { kyc_status: data };
}

export async function previewPrivateFile(admin: AdminClient, userId: string, payload: JsonRecord, roles: readonly string[]) {
  await requireRole(admin, userId, roles);
  const path = textValue(payload.path, "파일 경로", 500);
  if (!path || path.includes("..")) throw new HttpError(400, "파일 경로가 올바르지 않습니다.");

  const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("signed url failed", error);
    throw new HttpError(404, "파일을 찾을 수 없습니다.");
  }
  return { signed_url: data.signedUrl, expires_in: SIGNED_URL_SECONDS };
}

export async function listReferrals(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, referralRoles);
  const { data, error } = await admin
    .from("referral_relations")
    .select("id,referrer_id,invitee_id,status,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new HttpError(503, "추천 내역을 불러오지 못했습니다.");

  const rewards = await admin.schema("private").from("referral_rewards").select("relation_id,amount,status,risk_signals,decision_reason,decided_at");
  const rewardMap = new Map((rewards.data || []).map((row) => [row.relation_id, row]));
  return (data || []).map((row) => ({ ...row, reward: rewardMap.get(row.id) || null }));
}

export async function reviewReferral(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, referralRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_review_referral", {
    p_admin_id: userId,
    p_relation_id: assertUuid(payload.relation_id, "추천"),
    p_decision: textValue(payload.decision, "처리 결과", 20),
    p_reason: textValue(payload.reason, "사유", 500, false),
    p_force: Boolean(payload.force)
  }, "추천 보상을 처리하지 못했습니다.");
  await appendAudit(admin, userId, "추천 보상 처리", "referral_relation", String(payload.relation_id || ""), textValue(payload.reason, "사유", 500, false), null, data);
  return data;
}

export async function listCampaigns(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, financeRoles);
  const { data, error } = await admin
    .from("support_grant_campaigns")
    .select("id,name,amount,enabled,trigger_type,usage_scope,expires_in_days,starts_at,ends_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(503, "지원금 캠페인을 불러오지 못했습니다.");
  return data || [];
}

export async function updateCampaign(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_update_campaign", {
    p_admin_id: userId,
    p_campaign_id: assertUuid(payload.campaign_id, "캠페인"),
    p_name: payload.name ?? null,
    p_amount: payload.amount === undefined || payload.amount === "" ? null : Number(payload.amount),
    p_enabled: payload.enabled === undefined ? null : Boolean(payload.enabled),
    p_trigger_type: payload.trigger_type ?? null,
    p_usage_scope: payload.usage_scope ?? null,
    p_expires_in_days: payload.expires_in_days === undefined || payload.expires_in_days === "" ? null : Number(payload.expires_in_days),
    p_starts_at: optionalIso(payload.starts_at, "시작"),
    p_ends_at: optionalIso(payload.ends_at, "종료")
  }, "지원금 설정을 저장하지 못했습니다.");
  await appendAudit(admin, userId, "지원금 캠페인 수정", "support_grant_campaign", String(data.id || ""), null, null, data);
  return data;
}

export async function revokeGrant(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const data = await callRpc<JsonRecord>(admin, "putduk_admin_revoke_support_grant", {
    p_admin_id: userId,
    p_grant_id: assertUuid(payload.grant_id, "지원금"),
    p_reason: textValue(payload.reason, "회수 사유", 500)
  }, "지원금을 회수하지 못했습니다.");
  await appendAudit(admin, userId, "지원금 회수", "support_grant", String(data.id || ""), textValue(payload.reason, "회수 사유", 500), null, data);
  return data;
}

export async function listGrants(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  let query = admin
    .from("support_grants")
    .select("id,campaign_id,user_id,amount,status,expires_at,created_at,revoked_at,revoke_reason")
    .order("created_at", { ascending: false })
    .limit(120);
  if (payload.user_id) query = query.eq("user_id", assertUuid(payload.user_id, "회원"));
  const { data, error } = await query;
  if (error) throw new HttpError(503, "지원금 원장을 불러오지 못했습니다.");
  return data || [];
}

export async function listPayoutDestinations(admin: AdminClient, userId: string) {
  await requireRole(admin, userId, financeRoles);
  const { data, error } = await admin
    .schema("private")
    .from("payout_destinations")
    .select("id,destination_type,label,masked_value,qr_asset_path,enabled,bank_name,account_holder,guidance_text,usdt_network,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(503, "입금 안내 계좌를 불러오지 못했습니다.");
  return data || [];
}

export async function upsertPayoutDestination(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, financeRoles);
  const destinationType = textValue(payload.destination_type, "계좌 종류", 20);
  if (destinationType !== "bank" && destinationType !== "usdt") {
    throw new HttpError(400, "원화 계좌 또는 USDT를 선택해 주세요.");
  }

  const row = {
    destination_type: destinationType,
    label: textValue(payload.label, "표시 이름", 80),
    masked_value: textValue(payload.masked_value, "마스킹 값", 120),
    encrypted_value: textValue(payload.encrypted_value, "원문 값", 500, false),
    qr_asset_path: textValue(payload.qr_asset_path, "QR 이미지", 500, false),
    enabled: Boolean(payload.enabled),
    bank_name: textValue(payload.bank_name, "은행명", 80, false),
    account_holder: textValue(payload.account_holder, "예금주", 80, false),
    guidance_text: textValue(payload.guidance_text, "안내문구", 1000, false),
    usdt_network: textValue(payload.usdt_network, "USDT 네트워크", 40, false),
    created_by: userId,
    updated_at: new Date().toISOString()
  };

  let result;
  if (payload.destination_id) {
    const id = assertUuid(payload.destination_id, "입금 안내");
    result = await admin.schema("private").from("payout_destinations").update(row).eq("id", id).select("*").single();
  } else {
    result = await admin.schema("private").from("payout_destinations").insert(row).select("*").single();
  }
  if (result.error || !result.data) throw new HttpError(503, "입금 안내 계좌를 저장하지 못했습니다.");
  const safe = { ...result.data, encrypted_value: undefined };
  await appendAudit(admin, userId, "입금 안내 계좌 저장", "payout_destination", result.data.id, null, null, safe);
  return safe;
}

export async function listAuditLogs(admin: AdminClient, userId: string, payload: JsonRecord) {
  await requireRole(admin, userId, allAdminRoles);
  let query = admin
    .schema("private")
    .from("admin_audit_logs")
    .select("id,admin_id,action,target_type,target_id,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (payload.target_id) query = query.eq("target_id", assertUuid(payload.target_id, "대상"));
  const { data, error } = await query;
  if (error) throw new HttpError(503, "변경 기록을 불러오지 못했습니다.");
  return data || [];
}

export async function handleOpsAction(
  admin: AdminClient,
  user: User,
  action: string,
  payload: JsonRecord
): Promise<{ body: JsonRecord; status?: number } | null> {
  if (action === "members" || action === "list_members") {
    return { body: { ok: true, members: await listMembers(admin, user.id, payload) } };
  }
  if (action === "member" || action === "get_member") {
    return { body: { ok: true, member: await getMember(admin, user.id, payload) } };
  }
  if (action === "member_activity") {
    return { body: { ok: true, activity: await listMemberActivity(admin, user.id, payload) } };
  }
  if (action === "block_member" || (action === "update_member_status" && String(payload.status || "") === "blocked")) {
    return { body: { ok: true, profile: await setMemberStatus(admin, user.id, payload, "blocked") } };
  }
  if (action === "unblock_member" || (action === "update_member_status" && String(payload.status || "") === "active")) {
    return { body: { ok: true, profile: await setMemberStatus(admin, user.id, payload, "active") } };
  }
  if (action === "change_member_tier" || action === "update_member_tier") {
    return { body: { ok: true, profile: await changeMemberTier(admin, user.id, payload) } };
  }
  if (action === "reset_member_password") {
    return { body: { ok: true, ...(await resetMemberPassword(admin, user.id, payload)) } };
  }
  if (action === "notify_member") {
    return { body: { ok: true, notification: await notifyMember(admin, user.id, payload) } };
  }
  if (action === "broadcast_notice") {
    return { body: { ok: true, ...(await broadcastNotice(admin, user.id, payload)) } };
  }
  if (action === "create_deposit_request" || action === "create_operator_deposit") {
    return { body: { ok: true, deposit: await createOperatorDeposit(admin, user.id, payload) }, status: 201 };
  }
  if (action === "create_review_run") {
    return { body: { ok: true, task_run: await createReviewRun(admin, user.id, payload) }, status: 201 };
  }
  if (action === "assign_task") {
    return { body: { ok: true, assignment: await assignTask(admin, user.id, payload) }, status: 201 };
  }
  if (action === "cancel_assignment") {
    return { body: { ok: true, assignment: await cancelAssignment(admin, user.id, payload) } };
  }
  if (action === "create_brand") {
    return { body: { ok: true, brand: await createBrand(admin, user.id, payload) }, status: 201 };
  }
  if (action === "update_brand_profile") {
    return { body: { ok: true, brand: await updateBrandProfile(admin, user.id, payload) } };
  }
  if (action === "upsert_brand_evidence") {
    return { body: { ok: true, evidence: await upsertBrandEvidence(admin, user.id, payload) } };
  }
  if (action === "list_brand_evidence") {
    return { body: { ok: true, evidence: await listBrandEvidence(admin, user.id, payload) } };
  }
  if (action === "deposits" || action === "list_deposits") {
    return { body: { ok: true, deposits: await listDeposits(admin, user.id) } };
  }
  if (action === "withdrawals" || action === "list_withdrawals") {
    return { body: { ok: true, withdrawals: await listWithdrawals(admin, user.id) } };
  }
  if (action === "finance" || action === "list_finance") {
    return { body: { ok: true, ...(await listFinance(admin, user.id)) } };
  }
  if (action === "adjust_balance" || action === "credit_member" || action === "debit_member") {
    const direction = action === "credit_member" ? "credit" : action === "debit_member" ? "debit" : payload.direction;
    return { body: { ok: true, adjustment: await adjustMemberBalance(admin, user.id, { ...payload, direction }) } };
  }
  if (action === "review_deposit") {
    return { body: { ok: true, deposit: await reviewDeposit(admin, user.id, payload) } };
  }
  if (action === "review_withdrawal") {
    return { body: { ok: true, withdrawal: await reviewWithdrawal(admin, user.id, payload) } };
  }
  if (action === "kyc" || action === "list_kyc") {
    return { body: { ok: true, members: await listKyc(admin, user.id) } };
  }
  if (action === "review_kyc") {
    return { body: { ok: true, ...(await reviewKyc(admin, user.id, payload)) } };
  }
  if (action === "preview_private_file") {
    const roles = String(payload.purpose || "") === "kyc" ? kycRoles : financeRoles;
    return { body: { ok: true, ...(await previewPrivateFile(admin, user.id, payload, roles)) } };
  }
  if (action === "referrals" || action === "list_referrals") {
    return { body: { ok: true, referrals: await listReferrals(admin, user.id) } };
  }
  if (action === "review_referral") {
    return { body: { ok: true, reward: await reviewReferral(admin, user.id, payload) } };
  }
  if (action === "campaigns" || action === "list_campaigns") {
    return { body: { ok: true, campaigns: await listCampaigns(admin, user.id) } };
  }
  if (action === "update_campaign") {
    return { body: { ok: true, campaign: await updateCampaign(admin, user.id, payload) } };
  }
  if (action === "revoke_grant") {
    return { body: { ok: true, grant: await revokeGrant(admin, user.id, payload) } };
  }
  if (action === "grants" || action === "list_grants") {
    return { body: { ok: true, grants: await listGrants(admin, user.id, payload) } };
  }
  if (action === "payout_destinations" || action === "list_payout_destinations") {
    return { body: { ok: true, destinations: await listPayoutDestinations(admin, user.id) } };
  }
  if (action === "upsert_payout_destination") {
    return { body: { ok: true, destination: await upsertPayoutDestination(admin, user.id, payload) } };
  }
  if (action === "audit_logs" || action === "list_audit_logs") {
    return { body: { ok: true, logs: await listAuditLogs(admin, user.id, payload) } };
  }
  return null;
}

export { isOwnStoragePath };
