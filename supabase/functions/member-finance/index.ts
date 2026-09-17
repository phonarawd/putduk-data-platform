// 회원 입출금·KYC·세션 기록. 금액은 RPC·원장만 변경한다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders, HttpError, jsonResponse, rpcMessage, type JsonRecord } from "../_shared/http.ts";
import {
  ALLOWED_UPLOAD_TYPES,
  isAllowedUploadType,
  isAmountInRange,
  isOwnStoragePath,
  isSixDigitPin,
  isSupportedCurrency,
  isUuid,
  MAX_UPLOAD_BYTES,
  PRIVATE_BUCKET,
  SIGNED_URL_SECONDS
} from "../_shared/validate.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function authenticate(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "세션이 만료됐습니다.");
  return data.user;
}

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

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "";
  const candidate = forwarded.split(",")[0]?.trim();
  return candidate || null;
}

function textValue(value: unknown, label: string, max = 240, required = true): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate && !required) return null;
  if (!candidate) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (candidate.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return candidate;
}

async function listDepositDestinations() {
  const { data, error } = await admin
    .schema("private")
    .from("payout_destinations")
    .select("id,destination_type,label,masked_value,qr_asset_path,bank_name,account_holder,guidance_text,usdt_network")
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("deposit destinations failed", error);
    throw new HttpError(503, "입금 안내를 불러오지 못했습니다.");
  }
  return data || [];
}

async function requestUpload(userId: string, payload: JsonRecord) {
  const purpose = textValue(payload.purpose, "업로드 용도", 40);
  if (!purpose || !["kyc", "deposit_proof"].includes(purpose)) {
    throw new HttpError(400, "업로드 용도를 확인해 주세요.");
  }
  const fileName = textValue(payload.file_name, "파일 이름", 80);
  const contentType = String(payload.content_type || "").toLowerCase();
  if (!isAllowedUploadType(contentType)) {
    throw new HttpError(400, "이미지 또는 PDF 파일만 올릴 수 있습니다.");
  }

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${purpose}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("signed upload failed", error);
    throw new HttpError(503, "파일 업로드 주소를 만들지 못했습니다.");
  }

  return {
    bucket: PRIVATE_BUCKET,
    path,
    token: data.token,
    signed_url: data.signedUrl,
    expires_in: SIGNED_URL_SECONDS,
    max_bytes: MAX_UPLOAD_BYTES,
    allowed_types: ALLOWED_UPLOAD_TYPES
  };
}

async function submitDeposit(userId: string, payload: JsonRecord) {
  const currency = String(payload.currency || "KRW").toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError(400, "입금 통화를 확인해 주세요.");
  if (!isAmountInRange(payload.amount)) throw new HttpError(400, "입금 금액을 확인해 주세요.");
  const proofPath = textValue(payload.proof_path, "입금 증빙", 500);
  if (!isOwnStoragePath(userId, proofPath)) throw new HttpError(400, "본인 증빙 파일만 등록할 수 있습니다.");

  const { data, error } = await admin.rpc("putduk_member_submit_deposit", {
    p_user_id: userId,
    p_currency: currency,
    p_amount: Number(payload.amount),
    p_proof_path: proofPath,
    p_note: textValue(payload.note, "메모", 500, false),
    p_destination_id: payload.destination_id || null
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "입금 확인 요청을 접수하지 못했습니다."));
  return data;
}

async function setPin(userId: string, payload: JsonRecord) {
  if (!isSixDigitPin(payload.pin)) throw new HttpError(400, "출금 비밀번호는 숫자 6자리여야 합니다.");
  const { error } = await admin.rpc("putduk_member_set_withdrawal_pin", {
    p_user_id: userId,
    p_pin: String(payload.pin)
  });
  if (error) throw new HttpError(400, rpcMessage(error, "출금 비밀번호를 저장하지 못했습니다."));
  return { saved: true };
}

async function lockStake(userId: string, payload: JsonRecord) {
  const runId = String(payload.task_run_id || payload.run_id || "").trim();
  if (!isUuid(runId)) throw new HttpError(400, "근무 정보가 필요해요.");
  const { data, error } = await admin.rpc("putduk_member_lock_stake", {
    p_user_id: userId,
    p_task_run_id: runId
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "근무 보증을 잠그지 못했어요."));
  return data;
}

async function submitWork(userId: string, payload: JsonRecord) {
  const runId = String(payload.task_run_id || payload.run_id || "").trim();
  if (!isUuid(runId)) throw new HttpError(400, "근무 정보가 필요해요.");
  const choiceId = String(payload.choice_id || payload.choice || payload.picked || "").trim();
  if (!choiceId) throw new HttpError(400, "맞아요 / 달라요 중 하나를 골라 주세요.");
  const label = textValue(payload.choice_label || payload.label, "고른 보기", 80, false);

  const { data, error } = await admin.rpc("putduk_member_submit_work", {
    p_user_id: userId,
    p_task_run_id: runId,
    p_choice_id: choiceId,
    p_choice_label: label
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "근무를 제출하지 못했어요."));
  return data;
}

async function walletSnapshot(userId: string) {
  const { data, error } = await admin
    .from("wallet_accounts")
    .select("bucket,currency,available_amount,held_amount")
    .eq("user_id", userId)
    .eq("currency", "KRW");
  if (error) {
    console.error("wallet snapshot failed", error);
    throw new HttpError(503, "지갑을 불러오지 못했어요.");
  }
  const rows = Array.isArray(data) ? data : [];
  const buckets = Object.fromEntries(rows.map((row) => [row.bucket, row]));
  const work = buckets.work_balance || {};
  return {
    support_grant: Number(buckets.support_grant?.available_amount || 0),
    work_balance: Number(work.available_amount || 0),
    available: Number(buckets.available?.available_amount || 0),
    held_amount: Number(work.held_amount || 0),
    buckets: rows
  };
}

async function submitWithdrawal(userId: string, payload: JsonRecord) {
  const currency = String(payload.currency || "KRW").toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError(400, "출금 통화를 확인해 주세요.");
  if (!isAmountInRange(payload.amount)) throw new HttpError(400, "출금 금액을 확인해 주세요.");
  if (!isSixDigitPin(payload.pin)) throw new HttpError(400, "출금 비밀번호는 숫자 6자리여야 합니다.");
  const includePrincipal = payload.include_principal === true
    || ["1", "true", "yes", "원금포함", "원금", "include_principal", "principal"].includes(String(payload.include_principal ?? payload.kind ?? "").trim().toLowerCase());

  const { data, error } = await admin.rpc("putduk_member_withdraw_request", {
    p_user_id: userId,
    p_currency: currency,
    p_amount: Number(payload.amount),
    p_pin: String(payload.pin),
    p_destination_type: textValue(payload.destination_type, "출금 방법", 20),
    p_include_principal: includePrincipal,
    p_bank_name: textValue(payload.bank_name, "은행명", 80, false),
    p_account_holder: textValue(payload.account_holder, "예금주", 80, false),
    p_account_number: textValue(payload.account_number, "계좌번호", 80, false),
    p_usdt_network: textValue(payload.usdt_network, "USDT 네트워크", 40, false),
    p_usdt_address: textValue(payload.usdt_address, "USDT 주소", 200, false)
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "출금 요청을 접수하지 못했습니다."));
  return data;
}

async function submitKyc(userId: string, payload: JsonRecord) {
  const front = textValue(payload.front_path, "신분증 앞면", 500);
  const back = textValue(payload.back_path, "신분증 뒷면", 500);
  const selfie = textValue(payload.selfie_path, "셀카", 500);
  if (![front, back, selfie].every((path) => isOwnStoragePath(userId, path))) {
    throw new HttpError(400, "본인확인 파일 경로를 확인해 주세요.");
  }
  const { data, error } = await admin.rpc("putduk_member_submit_kyc", {
    p_user_id: userId,
    p_front_path: front,
    p_back_path: back,
    p_selfie_path: selfie
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "본인확인 서류를 접수하지 못했습니다."));
  return { kyc_status: data };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    const user = await authenticate(request);
    const payload = await parseRequest(request);
    const action = String(payload.action || "");

    if (action === "record_session") {
      await admin.rpc("putduk_member_record_session", {
        p_user_id: user.id,
        p_ip: clientIp(request)
      });
      return jsonResponse(request, { ok: true });
    }

    if (action === "deposit_destinations") {
      return jsonResponse(request, { ok: true, destinations: await listDepositDestinations() });
    }

    if (action === "request_upload") {
      return jsonResponse(request, { ok: true, upload: await requestUpload(user.id, payload) });
    }

    if (action === "submit_deposit") {
      return jsonResponse(request, { ok: true, deposit: await submitDeposit(user.id, payload) }, 201);
    }

    if (action === "set_withdrawal_pin") {
      return jsonResponse(request, { ok: true, ...(await setPin(user.id, payload)) });
    }

    if (action === "lock_stake" || action === "start_lock") {
      return jsonResponse(request, { ok: true, lock: await lockStake(user.id, payload) });
    }

    if (action === "submit_work" || action === "submit_task" || action === "submit_run") {
      return jsonResponse(request, { ok: true, run: await submitWork(user.id, payload) });
    }

    if (action === "wallet" || action === "wallet_snapshot") {
      return jsonResponse(request, { ok: true, wallet: await walletSnapshot(user.id) });
    }

    if (action === "submit_withdrawal" || action === "withdraw_request") {
      return jsonResponse(request, { ok: true, withdrawal: await submitWithdrawal(user.id, payload) }, 201);
    }

    if (action === "submit_kyc") {
      return jsonResponse(request, { ok: true, ...(await submitKyc(user.id, payload)) });
    }

    throw new HttpError(404, "지원하지 않는 요청입니다.");
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(request, { ok: false, error: error.message }, error.status);
    console.error("member-finance error", error);
    return jsonResponse(request, { ok: false, error: "요청을 처리하지 못했어요." }, 500);
  }
});
