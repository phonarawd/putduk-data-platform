import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { handleOpsAction, upsertWorkNode } from "../_shared/admin-ops.ts";

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
const reviewRoles = ["super_admin", "work_review"];

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

function httpErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 600 ? status : null;
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

type WorkSpec = {
  v: 1;
  stake: number;
  stipend: number;
  photos: string[];
  choices: string[];
  answer: number;
  slots: number;
};

function parseWorkSpec(value: unknown): WorkSpec | null {
  const raw = typeof value === "string" ? value.trim() : value && typeof value === "object" ? JSON.stringify(value) : "";
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as JsonRecord;
    if (!parsed || parsed.v !== 1) return null;
    const choices = Array.isArray(parsed.choices) ? parsed.choices.map((item) => String(item || "").trim()).filter(Boolean) : [];
    const photos = Array.isArray(parsed.photos) ? parsed.photos.map((item) => String(item || "").trim()).filter(Boolean) : [];
    return {
      v: 1,
      stake: Number(parsed.stake || 0),
      stipend: Number(parsed.stipend || 0),
      photos,
      choices,
      answer: Number(parsed.answer || 1),
      slots: Number(parsed.slots || 0)
    };
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return [];
}

function payloadPhotos(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as JsonRecord;
  const nested = Array.isArray(rec.photos) ? rec.photos : [];
  const extra = [rec.photo, rec.image, rec.question_image_path, rec.evidence_path, rec.proof_path]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return [...nested.map((item) => String(item || "").trim()).filter(Boolean), ...extra];
}

function payloadChoice(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const rec = payload as JsonRecord;
  return String(
    rec.choice_id || rec.choice || rec.selected_choice || rec.picked || rec.answer || rec.selected || rec.member_choice || ""
  ).trim();
}

function payloadChoiceLabel(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const rec = payload as JsonRecord;
  return String(rec.label || rec.choice_label || rec.member_choice_label || "").trim();
}

function payloadSubmittedAt(payload: unknown, fallback: unknown): string | null {
  if (payload && typeof payload === "object") {
    const rec = payload as JsonRecord;
    const fromPayload = String(rec.submitted_at || rec.completed_at || "").trim();
    if (fromPayload) return fromPayload;
  }
  const extra = String(fallback || "").trim();
  return extra || null;
}

function hasReviewPhoto(paths: string[]): boolean {
  return paths.some((item) => String(item || "").trim().length > 0);
}

function buildWorkSpec(payload: JsonRecord, before?: JsonRecord | null): string | null {
  const existing = parseWorkSpec(payload.work_spec || payload.completion_effect || before?.completion_effect);
  const photos = stringList(payload.photos).length
    ? stringList(payload.photos)
    : [payload.photo_1, payload.photo_2].map((item) => String(item || "").trim()).filter(Boolean);
  const choices = stringList(payload.choices).length
    ? stringList(payload.choices)
    : [payload.choice_1, payload.choice_2].map((item) => String(item || "").trim()).filter(Boolean);
  const touched = payload.stake !== undefined
    || payload.stipend !== undefined
    || payload.slots !== undefined
    || payload.answer !== undefined
    || photos.length > 0
    || choices.length > 0
    || payload.work_spec !== undefined;
  if (!touched && !existing) {
    return textValue(payload.completion_effect, "완료 효과", 80, false);
  }
  if (choices.length === 1) throw new HttpError(400, "보기는 두 개를 모두 입력해 주세요.");
  if (choices.length > 2) throw new HttpError(400, "보기는 두 개만 입력해 주세요.");
  const stake = payload.stake !== undefined ? numberValue(payload.stake, "근무 보증", 0, 100000000) : Number(existing?.stake || 0);
  const stipend = payload.stipend !== undefined
    ? numberValue(payload.stipend, "수당", 0, 100000000)
    : Number(existing?.stipend ?? payload.reward_max ?? payload.reward_min ?? 0);
  const slots = payload.slots !== undefined
    ? numberValue(payload.slots, "슬롯", 0, 1000000)
    : Number(existing?.slots ?? payload.daily_capacity ?? 0);
  const answer = payload.answer !== undefined ? numberValue(payload.answer, "정답", 1, 2) : Number(existing?.answer || 1);
  if (choices.length === 2 && (answer < 1 || answer > 2)) {
    throw new HttpError(400, "정답은 보기 1 또는 보기 2여야 합니다.");
  }
  const spec: WorkSpec = {
    v: 1,
    stake,
    stipend,
    photos: photos.length ? photos : (existing?.photos || []),
    choices: choices.length === 2 ? choices : (existing?.choices || []),
    answer,
    slots
  };
  return JSON.stringify(spec);
}

function withWorkSpec<T extends JsonRecord>(row: T): T & { work_spec: WorkSpec | null } {
  const fromJson = parseWorkSpec(row.completion_effect);
  const columnChoices = [row.choice_a_ko, row.choice_b_ko].map((item) => String(item || "").trim()).filter(Boolean);
  const choices = columnChoices.length === 2
    ? columnChoices
    : (fromJson?.choices?.length ? fromJson.choices : columnChoices);
  const photos = String(row.question_image_path || "").trim()
    ? [String(row.question_image_path).trim()]
    : (fromJson?.photos?.length ? fromJson.photos : []);
  const choice = String(row.correct_choice || "").toLowerCase();
  const answer = choice === "b" ? 2 : choice === "a" ? 1 : Number(fromJson?.answer || 1);
  const spec: WorkSpec = {
    v: 1,
    stake: Number(row.stake_krw ?? fromJson?.stake ?? 0),
    stipend: Number(row.stipend_krw ?? fromJson?.stipend ?? row.reward_max ?? row.reward_min ?? 0),
    photos,
    choices,
    answer,
    slots: Number(row.daily_cap ?? fromJson?.slots ?? row.daily_capacity ?? 0)
  };
  const has = spec.stake || spec.stipend || spec.photos.length || spec.choices.length || spec.slots;
  return { ...row, work_spec: has || fromJson ? spec : null };
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
  const brandResult = await admin
    .from("partner_brands")
    .select("id,slug,display_name_ko,legal_name,category,description_ko,verification_status,verification_note,logo_asset_path,photo_asset_path,logo_usage_status,published,created_at,updated_at")
    .order("display_name_ko", { ascending: true });

  let nodeResult = await admin
    .from("nodes")
    .select("id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,daily_capacity,enabled,motion_profile,motion_version,allowed_tiers,scene_theme,vehicle_type,route_type,particle_style,completion_effect,supply_source,catalog_status,published_at,published_by,created_at,updated_at,stake_krw,stipend_krw,tier_band,partner_slug,question_prompt_ko,question_image_path,choice_a_ko,choice_b_ko,daily_cap,requires_assign,is_trial")
    .order("created_at", { ascending: false });

  if (nodeResult.error) {
    nodeResult = await admin
      .from("nodes")
      .select("id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,daily_capacity,enabled,motion_profile,motion_version,allowed_tiers,scene_theme,vehicle_type,route_type,particle_style,completion_effect,supply_source,catalog_status,published_at,published_by,created_at,updated_at")
      .order("created_at", { ascending: false });
  }

  if (brandResult.error || nodeResult.error) {
    console.error("catalog read failed", brandResult.error || nodeResult.error);
    throw new HttpError(503, "업무 카탈로그를 불러오지 못했습니다.");
  }

  const nodes = (nodeResult.data || []) as JsonRecord[];
  const nodeIds = nodes.map((row) => String(row.id || "")).filter(Boolean);
  const answers = nodeIds.length
    ? await admin.schema("private").from("node_answer_keys").select("node_id,correct_choice").in("node_id", nodeIds)
    : { data: [] as { node_id: string; correct_choice: string }[], error: null };
  const answerMap = new Map((answers.data || []).map((row) => [row.node_id, row.correct_choice]));

  return {
    brands: brandResult.data || [],
    nodes: nodes.map((row) => withWorkSpec({
      ...row,
      correct_choice: answerMap.get(String(row.id || "")) || null
    }))
  };
}

async function listReviews() {
  const reviewStatuses = ["submitted", "review_pending", "approved", "rework", "rejected"];
  const runSelectWithTrial = "id,public_id,user_id,node_id,status,reward_amount,progress,created_at,completed_at,updated_at,is_trial,stake_bucket";
  const runSelect = "id,public_id,user_id,node_id,status,reward_amount,progress,created_at,completed_at,updated_at";
  let runQuery = await admin
    .from("task_runs")
    .select(runSelectWithTrial)
    .in("status", reviewStatuses)
    .order("updated_at", { ascending: false })
    .limit(120);
  if (runQuery.error && /is_trial|stake_bucket/i.test(String(runQuery.error.message || ""))) {
    runQuery = await admin
      .from("task_runs")
      .select(runSelect)
      .in("status", reviewStatuses)
      .order("updated_at", { ascending: false })
      .limit(120);
  }
  const { data: runs, error: runError } = runQuery;

  if (runError) {
    console.error("review queue read failed", runError);
    throw new HttpError(503, "검수 목록을 불러오지 못했습니다.");
  }

  const rows = runs || [];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const nodeIds = [...new Set(rows.map((row) => row.node_id).filter(Boolean))];

  const [profileResult, nodeFull] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id,public_id,display_name,member_tier").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    nodeIds.length
      ? admin.from("nodes").select("id,public_id,partner_brand_id,title_ko,node_family,reward_min,reward_max,completion_effect,stake_krw,stipend_krw,is_trial,tier_band,question_image_path,choice_a_ko,choice_b_ko,question_prompt_ko").in("id", nodeIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  const nodeResult = nodeFull.error && nodeIds.length
    ? await admin.from("nodes").select("id,public_id,partner_brand_id,title_ko,node_family,reward_min,reward_max,completion_effect").in("id", nodeIds)
    : nodeFull;

  if (profileResult.error || nodeResult.error) {
    console.error("review context read failed", profileResult.error || nodeResult.error);
    throw new HttpError(503, "검수 대상 정보를 불러오지 못했습니다.");
  }

  const profileMap = new Map((profileResult.data || []).map((row) => [row.id, row]));
  const nodeMap = new Map((nodeResult.data || []).map((row) => [row.id, row]));
  const brandIds = [...new Set((nodeResult.data || []).map((row) => row.partner_brand_id).filter(Boolean))];
  const brandResult = brandIds.length
    ? await admin.from("partner_brands").select("id,display_name_ko").in("id", brandIds)
    : { data: [], error: null };

  if (brandResult.error) {
    console.error("review brand read failed", brandResult.error);
    throw new HttpError(503, "협력사 정보를 불러오지 못했습니다.");
  }

  const brandMap = new Map((brandResult.data || []).map((row) => [row.id, row]));
  const runIds = rows.map((row) => String(row.id || "")).filter(Boolean);
  const [submissionResult, answerResult, eventResult] = await Promise.all([
    runIds.length
      ? admin.from("work_submissions").select("task_run_id,answer_payload,submitted_at").in("task_run_id", runIds)
      : Promise.resolve({ data: [] as JsonRecord[], error: null }),
    nodeIds.length
      ? admin.schema("private").from("node_answer_keys").select("node_id,correct_choice").in("node_id", nodeIds)
      : Promise.resolve({ data: [] as { node_id: string; correct_choice: string }[], error: null }),
    runIds.length
      ? admin.from("task_events").select("task_run_id,event_type,event_payload,created_at").in("task_run_id", runIds).eq("event_type", "submitted").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as JsonRecord[], error: null })
  ]);
  if (submissionResult.error) console.error("review submission read failed", submissionResult.error);
  if (answerResult.error) console.error("review answer key read failed", answerResult.error);
  if (eventResult.error) console.error("review event read failed", eventResult.error);
  const submissionMap = new Map((submissionResult.data || []).map((row) => [String(row.task_run_id), row]));
  const correctMap = new Map((answerResult.data || []).map((row) => [String(row.node_id), row.correct_choice]));
  const eventChoice = new Map<string, string>();
  const eventLabel = new Map<string, string>();
  const eventSubmittedAt = new Map<string, string>();
  for (const row of (eventResult.data || []) as JsonRecord[]) {
    const runId = String(row.task_run_id || "");
    const choice = payloadChoice(row.event_payload);
    const label = payloadChoiceLabel(row.event_payload);
    const submittedAt = payloadSubmittedAt(row.event_payload, row.created_at);
    if (runId && choice && !eventChoice.has(runId)) eventChoice.set(runId, choice);
    if (runId && label && !eventLabel.has(runId)) eventLabel.set(runId, label);
    if (runId && submittedAt && !eventSubmittedAt.has(runId)) eventSubmittedAt.set(runId, submittedAt);
  }
  const reviews = rows.map((row) => {
    const profile = profileMap.get(row.user_id);
    const node = nodeMap.get(row.node_id);
    const brand = node ? brandMap.get(node.partner_brand_id) : null;
    const spec = parseWorkSpec(node?.completion_effect);
    const stipend = Number(node?.stipend_krw ?? spec?.stipend ?? row.reward_amount ?? node?.reward_max ?? node?.reward_min ?? 0);
    const stake = Number(node?.stake_krw ?? spec?.stake ?? 0);
    const trial = row.is_trial === true
      || node?.is_trial === true
      || node?.tier_band === "체험"
      || String(row.stake_bucket || "") === "support_grant"
      || (stake === 10000 && stipend === 3000);
    const submission = submissionMap.get(String(row.id || ""));
    const questionPhoto = String(node?.question_image_path || spec?.photos?.[0] || "").trim();
    const submissionPhotos = payloadPhotos(submission?.answer_payload);
    const photos = [...new Set([questionPhoto, ...submissionPhotos].filter(Boolean))];
    const choiceA = String(node?.choice_a_ko || spec?.choices?.[0] || "").trim();
    const choiceB = String(node?.choice_b_ko || spec?.choices?.[1] || "").trim();
    const correctRaw = String(correctMap.get(String(row.node_id || "")) || "").toLowerCase();
    const correctAnswer = correctRaw === "b" ? 2 : correctRaw === "a" ? 1 : Number(spec?.answer || 1);
    const memberChoiceRaw = payloadChoice(submission?.answer_payload) || eventChoice.get(String(row.id || "")) || "";
    const memberChoiceLabel = payloadChoiceLabel(submission?.answer_payload) || eventLabel.get(String(row.id || "")) || "";
    const submittedAt = payloadSubmittedAt(submission?.answer_payload, submission?.submitted_at)
      || eventSubmittedAt.get(String(row.id || ""))
      || String(row.completed_at || "");
    return {
      id: row.id,
      public_id: row.public_id,
      user_id: row.user_id,
      member_public_id: profile?.public_id || null,
      member_name: profile?.display_name || "퍼뜩 회원",
      member_tier: profile?.member_tier || "라인",
      node_id: row.node_id,
      node_public_id: node?.public_id || null,
      company_name: brand?.display_name_ko || "협력사 미지정",
      node_title: node?.title_ko || "업무 정보 없음",
      node_family: node?.node_family || null,
      status: row.status,
      reward_amount: Number(row.reward_amount || 0),
      stake_amount: stake,
      stipend_amount: stipend,
      is_trial: trial,
      progress: Number(row.progress || 0),
      created_at: row.created_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
      question_image_path: questionPhoto || null,
      question_prompt_ko: String(node?.question_prompt_ko || "").trim() || null,
      choice_a_ko: choiceA || null,
      choice_b_ko: choiceB || null,
      correct_choice: correctRaw === "b" ? "b" : correctRaw === "a" ? "a" : (correctAnswer === 2 ? "b" : "a"),
      correct_answer: correctAnswer,
      member_choice: memberChoiceRaw || null,
      member_choice_label: memberChoiceLabel || null,
      submitted_at: submittedAt || null,
      has_member_choice: Boolean(memberChoiceRaw || memberChoiceLabel),
      photos,
      has_photo: hasReviewPhoto(photos),
      high_value: stake >= 100000000
    };
  });

  return {
    reviews,
    pending_count: reviews.filter((row) => ["submitted", "review_pending"].includes(row.status)).length,
    completed_count: reviews.filter((row) => ["approved", "rework", "rejected"].includes(row.status)).length
  };
}

async function reviewTask(userId: string, payload: JsonRecord) {
  const taskRunId = assertUuid(payload.task_run_id, "업무 실행");
  const decision = String(payload.decision || "").trim().toLowerCase();
  if (!["approved", "rework", "rejected"].includes(decision)) {
    throw new HttpError(400, "검수 결과를 선택해 주세요.");
  }

  const reason = textValue(payload.reason, "검수 메모", 1000, false);
  const score = payload.score === undefined || payload.score === null || payload.score === ""
    ? null
    : numberValue(payload.score, "검수 점수", 0, 1);
  const before = await admin
    .from("task_runs")
    .select("id,public_id,user_id,node_id,status,reward_amount,reward_status,progress,created_at,completed_at,updated_at")
    .eq("id", taskRunId)
    .maybeSingle();

  if (before.error) {
    console.error("review target read failed", before.error);
    throw new HttpError(503, "검수 대상 업무를 확인하지 못했습니다.");
  }
  if (!before.data) throw new HttpError(404, "검수 대상 업무를 찾을 수 없습니다.");

  if (decision === "approved") {
    const node = await admin
      .from("nodes")
      .select("id,stake_krw,question_image_path,completion_effect,tier_band,title_ko")
      .eq("id", before.data.node_id)
      .maybeSingle();
    const spec = parseWorkSpec(node.data?.completion_effect);
    const stake = Number(node.data?.stake_krw ?? spec?.stake ?? 0);
    const submission = await admin
      .from("work_submissions")
      .select("answer_payload,submitted_at")
      .eq("task_run_id", taskRunId)
      .maybeSingle();
    const events = await admin
      .from("task_events")
      .select("event_payload,created_at")
      .eq("task_run_id", taskRunId)
      .eq("event_type", "submitted")
      .order("created_at", { ascending: false })
      .limit(5);
    const photos = [
      String(node.data?.question_image_path || "").trim(),
      ...(spec?.photos || []),
      ...payloadPhotos(submission.data?.answer_payload)
    ].filter(Boolean);
    const eventChoice = (events.data || []).map((row) => payloadChoice(row.event_payload)).find(Boolean) || "";
    const memberChoice = payloadChoice(submission.data?.answer_payload) || eventChoice;
    if (!hasReviewPhoto(photos) && !memberChoice) {
      throw new HttpError(400, "문제 사진도 제출 보기도 없으면 승인할 수 없어요.");
    }
    if (stake >= 100000000 && !hasReviewPhoto(photos)) {
      throw new HttpError(400, "1억 칸은 문제 사진이 있어야 승인할 수 있어요. 사진 없는 근무는 승인하지 마세요.");
    }
  }

  const { data, error } = await admin.rpc("putduk_admin_review_task", {
    p_task_run_id: taskRunId,
    p_reviewer_id: userId,
    p_decision: decision,
    p_reason: reason,
    p_score: score
  });

  if (error || !data) {
    console.error("review settlement failed", error);
    const message = String(error?.message || "");
    if (message.includes("상태") || message.includes("검수") || message.includes("권한")) {
      throw new HttpError(400, message);
    }
    throw new HttpError(503, "검수 결과를 저장하지 못했습니다.");
  }

  await appendAudit(
    userId,
    decision === "approved" ? "업무 검수 완료" : decision === "rework" ? "업무 재확인 요청" : "업무 반려",
    "task_run",
    taskRunId,
    reason,
    before.data,
    data
  );

  return data;
}

function verificationStatus(value: unknown): "pending" | "submitted" | "approved" | "rejected" | "expired" {
  const candidate = String(value || "pending");
  if (!["pending", "submitted", "approved", "rejected", "expired"].includes(candidate)) {
    throw new HttpError(400, "협력 자료 상태가 올바르지 않습니다.");
  }
  return candidate as "pending" | "submitted" | "approved" | "rejected" | "expired";
}

function logoUsageStatus(value: unknown): "not_submitted" | "submitted" | "approved" | "expired" {
  const candidate = String(value || "not_submitted");
  if (!["not_submitted", "submitted", "approved", "expired"].includes(candidate)) {
    throw new HttpError(400, "로고 사용 상태가 올바르지 않습니다.");
  }
  return candidate as "not_submitted" | "submitted" | "approved" | "expired";
}

async function getBrand(id: string) {
  const { data, error } = await admin.from("partner_brands").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("brand read failed", error);
    throw new HttpError(503, "협력사 정보를 불러오지 못했습니다.");
  }
  if (!data) throw new HttpError(404, "협력사를 찾을 수 없습니다.");
  return data;
}

async function updateBrand(userId: string, payload: JsonRecord, action: "update" | "approve" | "publish" | "unpublish") {
  const brandId = assertUuid(payload.brand_id, "협력사");
  const before = await getBrand(brandId);
  const patch: JsonRecord = {};

  if (action === "approve") {
    patch.verification_status = "approved";
    patch.logo_usage_status = "approved";
    patch.verification_note = textValue(payload.verification_note, "확인 메모", 1000, false);
    const logoPath = textValue(payload.logo_asset_path ?? before.logo_asset_path, "로고 파일 경로", 500, false);
    if (!logoPath) throw new HttpError(400, "승인 전에 로고 파일 경로를 등록해 주세요.");
    patch.logo_asset_path = logoPath;
    const photoPath = textValue(payload.photo_asset_path ?? before.photo_asset_path, "사진 파일 경로", 500, false);
    if (photoPath) patch.photo_asset_path = photoPath;
    patch.published = false;
  } else if (action === "publish") {
    if (before.verification_status !== "approved" || before.logo_usage_status !== "approved" || !before.logo_asset_path) {
      throw new HttpError(400, "협력 자료와 로고 사용 승인을 먼저 완료해 주세요.");
    }
    patch.published = true;
  } else if (action === "unpublish") {
    patch.published = false;
  } else {
    if (payload.verification_status !== undefined) patch.verification_status = verificationStatus(payload.verification_status);
    if (payload.logo_usage_status !== undefined) patch.logo_usage_status = logoUsageStatus(payload.logo_usage_status);
    if (payload.verification_note !== undefined) patch.verification_note = textValue(payload.verification_note, "확인 메모", 1000, false);
    if (payload.logo_asset_path !== undefined) patch.logo_asset_path = textValue(payload.logo_asset_path, "로고 파일 경로", 500, false);
    if (payload.photo_asset_path !== undefined) patch.photo_asset_path = textValue(payload.photo_asset_path, "사진 파일 경로", 500, false);
    if (payload.published !== undefined) {
      if (Boolean(payload.published)) {
        if (before.verification_status !== "approved" || before.logo_usage_status !== "approved" || !before.logo_asset_path) {
          throw new HttpError(400, "협력 자료와 로고 사용 승인을 먼저 완료해 주세요.");
        }
      }
      patch.published = Boolean(payload.published);
    }
  }

  if (Object.keys(patch).length === 0) throw new HttpError(400, "변경할 항목이 없습니다.");

  const { data, error } = await admin
    .from("partner_brands")
    .update(patch)
    .eq("id", brandId)
    .select("id,slug,display_name_ko,legal_name,category,verification_status,verification_note,logo_asset_path,photo_asset_path,logo_usage_status,published,created_at,updated_at")
    .single();

  if (error || !data) {
    console.error("brand update failed", error);
    throw new HttpError(503, "협력사 설정을 저장하지 못했습니다.");
  }

  const actionLabel = action === "approve" ? "협력 자료·로고 승인" : action === "publish" ? "협력사 회원 공개" : action === "unpublish" ? "협력사 회원 비공개" : "협력사 설정 수정";
  await appendAudit(userId, actionLabel, "partner_brand", brandId, textValue(payload.reason, "사유", 240, false), before, data);
  return data;
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
  const data = await upsertWorkNode(admin, userId, payload);
  return withWorkSpec(data);
}

async function updateNode(userId: string, payload: JsonRecord) {
  const nodeId = assertUuid(payload.node_id, "업무 카드");
  const data = await upsertWorkNode(admin, userId, { ...payload, node_id: nodeId });
  return withWorkSpec(data);
}

async function updateNodeStatus(userId: string, payload: JsonRecord, status: "published" | "paused" | "archived" | "draft") {
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
    status === "published" ? "업무 카드 공개" : status === "paused" ? "업무 카드 일시중지" : status === "draft" ? "업무 카드 복구" : "업무 카드 보관",
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

    if (action === "record_session") {
      const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "";
      const ip = forwarded.split(",")[0]?.trim() || null;
      const { error } = await admin.rpc("putduk_member_record_session", {
        p_user_id: user.id,
        p_ip: ip
      });
      if (error) {
        console.error("record session failed", error);
        throw new HttpError(503, "접속 기록을 남기지 못했습니다.");
      }
      return jsonResponse(request, { ok: true });
    }

    if (action === "catalog" || action === "list_catalog") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, ...(await listCatalog()) });
    }

    if (action === "reviews" || action === "list_reviews") {
      await requireRole(user.id, reviewRoles);
      return jsonResponse(request, { ok: true, ...(await listReviews()) });
    }

    if (action === "review_task") {
      await requireRole(user.id, reviewRoles);
      return jsonResponse(request, { ok: true, task_run: await reviewTask(user.id, payload) });
    }

    if (action === "update_brand") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, brand: await updateBrand(user.id, payload, "update") });
    }

    if (action === "approve_brand") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, brand: await updateBrand(user.id, payload, "approve") });
    }

    if (action === "publish_brand" || action === "unpublish_brand") {
      await requireRole(user.id, contentRoles);
      const actionName = action === "publish_brand" ? "publish" : "unpublish";
      return jsonResponse(request, { ok: true, brand: await updateBrand(user.id, payload, actionName) });
    }

    if (action === "create_node" || action === "upsert_node") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, node: await createNode(user.id, payload) }, action === "create_node" ? 201 : 200);
    }

    if (action === "update_node") {
      await requireRole(user.id, contentRoles);
      return jsonResponse(request, { ok: true, node: await updateNode(user.id, payload) });
    }

    if (action === "publish_node" || action === "pause_node" || action === "archive_node" || action === "restore_node") {
      await requireRole(user.id, contentRoles);
      const status = action === "publish_node"
        ? "published"
        : action === "pause_node"
          ? "paused"
          : action === "restore_node"
            ? "draft"
            : "archived";
      return jsonResponse(request, { ok: true, node: await updateNodeStatus(user.id, payload, status) });
    }

    const ops = await handleOpsAction(admin, user, action, payload);
    if (ops) return jsonResponse(request, ops.body, ops.status || 200);

    throw new HttpError(404, "지원하지 않는 운영 메뉴입니다.");
  } catch (error) {
    const status = httpErrorStatus(error);
    if (status != null) {
      return jsonResponse(request, { ok: false, error: (error as Error).message }, status);
    }
    console.error("admin-control error", error);
    return jsonResponse(request, { ok: false, error: "운영 요청을 처리하지 못했습니다." }, 500);
  }
});
