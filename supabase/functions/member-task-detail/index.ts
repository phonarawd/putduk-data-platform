import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders, HttpError, jsonResponse, type JsonRecord, userFromVerifiedJwt } from "../_shared/http.ts";
import { isOwnStoragePath, isUuid, PRIVATE_BUCKET, SIGNED_URL_SECONDS } from "../_shared/validate.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const REVIEW_EVENT_RE = /(submit|review|rework|reject|approve|complete|검수|재작업|반려|승인|완료)/i;
const BLOCKED_KEYS = new Set([
  "correct_choice",
  "correctchoice",
  "correct_answer",
  "correctanswer",
  "answer_key",
  "answerkey",
  "solution",
  "expected_answer",
  "expectedanswer"
]);

function safeObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function sanitizeMemberPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeMemberPayload(item, depth + 1));
  const record = safeObject(value);
  if (!record) {
    if (typeof value === "string") return value.slice(0, 4000);
    if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
    return String(value).slice(0, 4000);
  }
  const out: JsonRecord = {};
  for (const [key, raw] of Object.entries(record)) {
    const normalized = key.replace(/[^a-z0-9_]/gi, "").toLowerCase();
    if (BLOCKED_KEYS.has(normalized)) continue;
    out[key] = sanitizeMemberPayload(raw, depth + 1);
  }
  return out;
}

function collectPaths(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 6 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => collectPaths(item, out, depth + 1));
    return out;
  }
  const record = safeObject(value);
  if (!record) return out;
  for (const [key, raw] of Object.entries(record)) {
    const normalized = key.toLowerCase();
    if (["photo", "image", "question_image_path", "evidence_path", "proof_path", "file_path"].includes(normalized)) {
      const candidate = String(raw || "").trim();
      if (candidate) out.add(candidate);
      continue;
    }
    if (["photos", "images", "evidence", "attachments", "files"].includes(normalized) && Array.isArray(raw)) {
      raw.forEach((item) => {
        const candidate = typeof item === "string" ? item.trim() : "";
        if (candidate) out.add(candidate);
        else collectPaths(item, out, depth + 1);
      });
      continue;
    }
    collectPaths(raw, out, depth + 1);
  }
  return out;
}

function normalizePublicAsset(path: string): string | null {
  const raw = path.trim();
  if (!raw || raw.includes("..") || raw.includes("\\")) return null;
  if (raw.startsWith("brand-logos/")) return `/assets/${raw}`;
  if (raw.startsWith("assets/")) return `/${raw}`;
  if (raw.startsWith("/assets/") || raw.startsWith("/icons/")) return raw;
  if (/^https:\/\//i.test(raw)) return raw;
  return null;
}

async function resolveAsset(userId: string, path: unknown) {
  const raw = String(path || "").trim();
  if (!raw) return null;
  const publicUrl = normalizePublicAsset(raw);
  if (publicUrl) return { source_path: raw, url: publicUrl, signed: false, kind: raw.toLowerCase().endsWith(".pdf") ? "pdf" : "image" };
  if (!isOwnStoragePath(userId, raw)) return null;
  const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(raw, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("task detail signed url failed", error);
    return null;
  }
  return { source_path: raw, url: data.signedUrl, signed: true, kind: raw.toLowerCase().endsWith(".pdf") ? "pdf" : "image" };
}

function eventReason(payload: unknown): string | null {
  const rec = safeObject(payload);
  if (!rec) return null;
  const raw = rec.reason ?? rec.review_reason ?? rec.rejection_reason ?? rec.message ?? rec.note ?? rec.comment ?? rec.requested_changes ?? null;
  const text = String(raw ?? "").trim();
  return text ? text.slice(0, 2000) : null;
}

function eventStatus(payload: unknown): string | null {
  const rec = safeObject(payload);
  if (!rec) return null;
  const raw = rec.status ?? rec.next_status ?? rec.review_status ?? null;
  const text = String(raw ?? "").trim();
  return text ? text.slice(0, 120) : null;
}

async function taskDetail(userId: string, payload: JsonRecord) {
  const runId = String(payload.run_id || payload.task_run_id || "").trim();
  if (!isUuid(runId)) throw new HttpError(400, "업무 기록을 확인해 주세요.");

  const runResult = await admin
    .from("task_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (runResult.error) {
    console.error("task detail run failed", runResult.error);
    throw new HttpError(503, "업무 기록을 불러오지 못했습니다.");
  }
  if (!runResult.data) throw new HttpError(404, "업무 기록을 찾을 수 없습니다.");
  const run = runResult.data as JsonRecord;
  const nodeId = String(run.node_id || "").trim();

  const [nodeResult, submissionResult, eventResult, ledgerResult] = await Promise.all([
    nodeId
      ? admin.from("nodes")
        .select("id,partner_brand_id,title_ko,question_prompt_ko,question_image_path,stake_krw,stipend_krw,tier_band")
        .eq("id", nodeId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("work_submissions")
      .select("id,task_run_id,answer_payload,submitted_at")
      .eq("task_run_id", runId)
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1),
    admin.from("task_events")
      .select("id,task_run_id,event_type,event_payload,created_at")
      .eq("task_run_id", runId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(100),
    admin.schema("private").from("ledger_entries")
      .select("id,public_id,reference_type,reference_id,user_id,amount,entry_type,bucket,currency,created_at")
      .eq("user_id", userId)
      .eq("reference_id", runId)
      .order("created_at", { ascending: true })
      .limit(50)
  ]);

  if (nodeResult.error) console.error("task detail node failed", nodeResult.error);
  if (submissionResult.error) console.error("task detail submission failed", submissionResult.error);
  if (eventResult.error) console.error("task detail events failed", eventResult.error);
  if (ledgerResult.error) console.error("task detail ledger failed", ledgerResult.error);

  const node = (nodeResult.data || null) as JsonRecord | null;
  const partnerId = String(node?.partner_brand_id || "").trim();
  let partner: JsonRecord | null = null;
  if (partnerId && isUuid(partnerId)) {
    const partnerResult = await admin.from("partner_brands")
      .select("id,display_name_ko,slug,logo_asset_path")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerResult.error) console.error("task detail partner failed", partnerResult.error);
    partner = (partnerResult.data || null) as JsonRecord | null;
  }

  const submissionRow = Array.isArray(submissionResult.data) ? submissionResult.data[0] as JsonRecord | undefined : undefined;
  const safeSubmission = submissionRow
    ? {
      id: submissionRow.id || null,
      submitted_at: submissionRow.submitted_at || null,
      answer_payload: sanitizeMemberPayload(submissionRow.answer_payload)
    }
    : null;

  const publicEvents = (Array.isArray(eventResult.data) ? eventResult.data : [])
    .filter((row) => REVIEW_EVENT_RE.test(String((row as JsonRecord).event_type || "")))
    .map((row) => {
      const item = row as JsonRecord;
      return {
        id: item.id || null,
        event_type: item.event_type || null,
        status: eventStatus(item.event_payload),
        reason: eventReason(item.event_payload),
        created_at: item.created_at || null
      };
    });

  const paths = new Set<string>();
  if (node?.question_image_path) paths.add(String(node.question_image_path));
  collectPaths(submissionRow?.answer_payload, paths);
  (Array.isArray(eventResult.data) ? eventResult.data : []).forEach((row) => collectPaths((row as JsonRecord).event_payload, paths));
  const assets = (await Promise.all([...paths].map((path) => resolveAsset(userId, path)))).filter(Boolean);

  return {
    task_run: {
      id: run.id || null,
      public_id: run.public_id || null,
      status: run.status || null,
      reward_amount: run.reward_amount ?? null,
      reward_status: run.reward_status ?? null,
      started_at: run.started_at || run.created_at || null,
      completed_at: run.completed_at || null,
      created_at: run.created_at || null,
      updated_at: run.updated_at || null
    },
    node: node ? {
      id: node.id || null,
      title_ko: node.title_ko || null,
      question_prompt_ko: node.question_prompt_ko || null,
      question_image_path: node.question_image_path || null,
      stake_krw: node.stake_krw ?? null,
      stipend_krw: node.stipend_krw ?? null,
      tier_band: node.tier_band || null
    } : null,
    partner: partner ? {
      display_name_ko: partner.display_name_ko || null,
      slug: partner.slug || null,
      logo_asset_path: normalizePublicAsset(String(partner.logo_asset_path || ""))
    } : null,
    submission: safeSubmission,
    review_history: publicEvents,
    settlement: Array.isArray(ledgerResult.data) ? ledgerResult.data.map((entry) => {
      const row = entry as JsonRecord;
      return {
        public_id: row.public_id || null,
        amount: row.amount ?? null,
        entry_type: row.entry_type || null,
        bucket: row.bucket || null,
        currency: row.currency || "KRW",
        reference_type: row.reference_type || null,
        created_at: row.created_at || null
      };
    }) : [],
    assets
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  try {
    if (request.method !== "POST" && request.method !== "GET") throw new HttpError(405, "지원하지 않는 요청입니다.");
    const user = userFromVerifiedJwt(request);
    let payload: JsonRecord = {};
    if (request.method === "GET") payload = Object.fromEntries(new URL(request.url).searchParams.entries());
    else {
      try {
        const parsed = await request.json();
        payload = parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
      } catch {
        throw new HttpError(400, "요청 형식을 확인해 주세요.");
      }
    }
    const action = String(payload.action || "task_detail").trim();
    if (action !== "task_detail" && action !== "work_history_detail") throw new HttpError(404, "지원하지 않는 요청입니다.");
    return jsonResponse(request, { ok: true, detail: await taskDetail(user.id, payload) });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "업무 상세 정보를 불러오지 못했습니다.";
    if (!(error instanceof HttpError)) console.error("member-task-detail failed", error);
    return jsonResponse(request, { ok: false, error: message }, status);
  }
});