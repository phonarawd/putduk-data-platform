// 회원 입출금·KYC·세션 기록. 금액은 RPC·원장만 변경한다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { clientIp, corsHeaders, HttpError, jsonResponse, rpcMessage, userFromVerifiedJwt, type JsonRecord } from "../_shared/http.ts";
import {
  ALLOWED_UPLOAD_TYPES,
  isAllowedKycUploadType,
  isAllowedUploadType,
  isAmountInRange,
  isKycPathForDocumentKind,
  isOwnStoragePath,
  isSixDigitPin,
  isSupportedCurrency,
  isUuid,
  maskAccount,
  maskUsdt,
  MAX_UPLOAD_BYTES,
  PRIVATE_BUCKET,
  SIGNED_URL_SECONDS
} from "../_shared/validate.ts";
import { encryptPayoutSecret, payoutSecretFromEnv } from "../_shared/payout-crypto.ts";
import {
  challengeDepositInfo,
  lockDepositInfo,
  revealDepositInfo,
  setSecurityPin
} from "../_shared/deposit-info.ts";
import { DEPOSIT_INFO_PIN_REQUIRED } from "../_shared/deposit-pin.ts";
import { financeActionGuard, isFinanceApiOpen } from "../_shared/finance-api-guard.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function authenticate(request: Request) {
  return userFromVerifiedJwt(request);
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

function textValue(value: unknown, label: string, max = 240, required = true): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate && !required) return null;
  if (!candidate) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (candidate.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return candidate;
}

async function listDepositDestinations(userId: string, ip: string | null) {
  return challengeDepositInfo(admin, userId, ip);
}

async function requestUpload(userId: string, payload: JsonRecord) {
  const purpose = textValue(payload.purpose, "업로드 용도", 40);
  if (!purpose || !["kyc", "deposit_proof"].includes(purpose)) {
    throw new HttpError(400, "업로드 용도를 확인해 주세요.");
  }
  const fileName = textValue(payload.file_name, "파일 이름", 80);
  const contentType = String(payload.content_type || "").toLowerCase();
  const documentKind = purpose === "kyc"
    ? String(payload.document_kind || payload.kind || "").trim().toLowerCase()
    : "";
  if (purpose === "kyc") {
    if (!["identity_front", "identity_back", "selfie"].includes(documentKind)) {
      throw new HttpError(400, "본인확인 파일 종류를 확인해 주세요.");
    }
    if (!isAllowedKycUploadType(contentType, documentKind)) {
      throw new HttpError(400, documentKind === "selfie"
        ? "셀카는 JPG, PNG, WEBP만 올릴 수 있어요."
        : "이미지 또는 PDF 파일만 올릴 수 있습니다.");
    }
  } else if (!isAllowedUploadType(contentType)) {
    throw new HttpError(400, "이미지 또는 PDF 파일만 올릴 수 있습니다.");
  }

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = purpose === "kyc" ? "kyc" : "deposit-proof";
  const path = purpose === "kyc"
    ? `${folder}/${userId}/${documentKind}/${crypto.randomUUID()}-${safeName}`
    : `${folder}/${userId}/${crypto.randomUUID()}-${safeName}`;
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

function parseInspectAnswers(payload: JsonRecord): string[] {
  const nested = payload.inspect && typeof payload.inspect === "object"
    ? (payload.inspect as JsonRecord).answers
    : null;
  const raw = payload.inspect_answers || nested || payload.answers;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseCatalogListing(payload: JsonRecord): JsonRecord | null {
  const nested = payload.listing && typeof payload.listing === "object"
    ? payload.listing as JsonRecord
    : payload.inspect && typeof payload.inspect === "object"
      ? ((payload.inspect as JsonRecord).listing as JsonRecord | undefined)
      : undefined;
  const raw = nested && typeof nested === "object" ? nested : null;
  if (!raw) return null;
  const productName = String(raw.product_name || raw.productName || "").replace(/\s+/g, " ").trim();
  const price = String(raw.price || "").replace(/\D/g, "");
  const option = String(raw.option || "").replace(/\s+/g, " ").trim();
  const shipping = String(raw.shipping || "").replace(/\s+/g, " ").trim();
  if (!productName && !price && !option && !shipping) return null;
  return {
    product_name: productName,
    price,
    option,
    shipping
  };
}

async function checkpointWork(userId: string, payload: JsonRecord) {
  const runId = String(payload.task_run_id || payload.run_id || "").trim();
  if (!isUuid(runId)) throw new HttpError(400, "근무 정보가 필요해요.");
  const listing = parseCatalogListing(payload);
  const answers = parseInspectAnswers(payload);
  const checkpoint = payload.checkpoint && typeof payload.checkpoint === "object"
    ? payload.checkpoint
    : listing
      ? { kind: "catalog_listing", listing }
      : { kind: "inspect", answers };
  const { data, error } = await admin.rpc("putduk_member_checkpoint_work", {
    p_user_id: userId,
    p_task_run_id: runId,
    p_payload: checkpoint
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "중간 저장을 하지 못했어요."));
  return data;
}

async function submitWork(userId: string, payload: JsonRecord) {
  const runId = String(payload.task_run_id || payload.run_id || "").trim();
  if (!isUuid(runId)) throw new HttpError(400, "근무 정보가 필요해요.");
  const listing = parseCatalogListing(payload);
  const kind = String(payload.work_kind || payload.kind || (listing ? "catalog_listing" : "")).trim();
  if (kind === "catalog_listing" || listing) {
    if (!listing || !listing.product_name || !listing.price || !listing.option || !listing.shipping) {
      throw new HttpError(400, "상품명·가격·옵션·배송을 모두 입력해 주세요.");
    }
    const label = textValue(payload.choice_label || payload.label || "상품 정보 4칸 입력 완료", "고른 보기", 80, false);
    const { data, error } = await admin.rpc("putduk_member_submit_work", {
      p_user_id: userId,
      p_task_run_id: runId,
      p_choice_id: String(payload.choice_id || "a").trim() || "a",
      p_choice_label: label,
      p_inspect: { kind: "catalog_listing", listing }
    });
    if (error || !data) throw new HttpError(400, rpcMessage(error, "근무를 제출하지 못했어요."));
    return data;
  }
  const answers = parseInspectAnswers(payload);
  if (answers.length !== 5) throw new HttpError(400, "오늘 배정 물량 5건을 대조해 주세요.");
  const choiceId = String(payload.choice_id || payload.choice || payload.picked || answers[4] || "").trim();
  if (!choiceId) throw new HttpError(400, "실물 라벨 번호를 입력해 주세요.");
  const label = textValue(payload.choice_label || payload.label || "오늘 배정 물량 5건 정상 검수", "고른 보기", 80, false);

  const { data, error } = await admin.rpc("putduk_member_submit_work", {
    p_user_id: userId,
    p_task_run_id: runId,
    p_choice_id: choiceId,
    p_choice_label: label,
    p_inspect: { answers }
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
  const work = buckets.work_balance || null;
  const amountOf = (row: JsonRecord | null | undefined, field: string) => {
    if (!row || row[field] == null || row[field] === "") return null;
    const amount = Number(row[field]);
    return Number.isFinite(amount) ? amount : null;
  };
  return {
    support_grant: amountOf(buckets.support_grant as JsonRecord, "available_amount"),
    work_balance: amountOf(work as JsonRecord, "available_amount"),
    available: amountOf(buckets.available as JsonRecord, "available_amount"),
    held_amount: amountOf(work as JsonRecord, "held_amount"),
    buckets: rows
  };
}

async function dailyTaskQuota(userId: string) {
  const { data, error } = await admin.rpc("putduk_member_daily_task_quota", { p_user_id: userId });
  if (error || !data) {
    console.error("daily task quota failed", error);
    throw new HttpError(503, "오늘 작업 가능 횟수를 불러오지 못했어요.");
  }
  return data;
}

async function submitWithdrawal(userId: string, payload: JsonRecord) {
  const currency = String(payload.currency || "KRW").toUpperCase();
  if (!isSupportedCurrency(currency)) throw new HttpError(400, "출금 통화를 확인해 주세요.");
  if (!isAmountInRange(payload.amount)) throw new HttpError(400, "출금 금액을 확인해 주세요.");
  if (!isSixDigitPin(payload.pin)) throw new HttpError(400, "출금 비밀번호는 숫자 6자리여야 합니다.");
  const includePrincipal = payload.include_principal === true
    || ["1", "true", "yes", "원금포함", "원금", "include_principal", "principal"].includes(String(payload.include_principal ?? payload.kind ?? "").trim().toLowerCase());

  const destinationType = textValue(payload.destination_type, "출금 방법", 20);
  const secret = payoutSecretFromEnv();
  if (!secret) {
    throw new HttpError(503, "지급정보 암호화 키가 설정되지 않아 출금을 접수할 수 없습니다.", "PAYOUT_SECRET_MISSING");
  }

  const bankName = textValue(payload.bank_name, "은행명", 80, false);
  const accountHolderPlain = textValue(payload.account_holder, "예금주", 80, false);
  const accountNumberPlain = textValue(payload.account_number, "계좌번호", 80, false);
  const usdtNetwork = textValue(payload.usdt_network, "USDT 네트워크", 40, false);
  const usdtAddressPlain = textValue(payload.usdt_address, "USDT 주소", 200, false);

  let accountHolderEnc: string | null = null;
  let accountNumberEnc: string | null = null;
  let usdtAddressEnc: string | null = null;
  let maskedValue: string | null = null;
  let destinationLabel: string | null = null;

  try {
    if (destinationType === "bank") {
      accountHolderEnc = await encryptPayoutSecret(accountHolderPlain, secret);
      accountNumberEnc = await encryptPayoutSecret(accountNumberPlain, secret);
      maskedValue = maskAccount(String(bankName || ""), String(accountNumberPlain || ""));
      destinationLabel = String(bankName || "").trim().slice(0, 80) || null;
    } else if (destinationType === "usdt") {
      usdtAddressEnc = await encryptPayoutSecret(usdtAddressPlain, secret);
      maskedValue = maskUsdt(String(usdtAddressPlain || ""));
      destinationLabel = `USDT ${String(usdtNetwork || "").trim()}`.slice(0, 80);
    }
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status || 503)
      : 503;
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code || "PAYOUT_SECRET_MISSING")
      : "PAYOUT_SECRET_MISSING";
    throw new HttpError(status, error instanceof Error ? error.message : "출금 지급정보를 저장하지 못했습니다.", code);
  }

  const { data, error } = await admin.rpc("putduk_member_withdraw_request", {
    p_user_id: userId,
    p_currency: currency,
    p_amount: Number(payload.amount),
    p_pin: String(payload.pin),
    p_destination_type: destinationType,
    p_include_principal: includePrincipal,
    p_bank_name: bankName,
    p_account_holder: accountHolderEnc,
    p_account_number: accountNumberEnc,
    p_usdt_network: usdtNetwork,
    p_usdt_address: usdtAddressEnc,
    p_masked_value: maskedValue,
    p_destination_label: destinationLabel
  });
  if (error || !data) throw new HttpError(400, rpcMessage(error, "출금 요청을 접수하지 못했습니다."));
  return data;
}

async function submitKyc(userId: string, payload: JsonRecord) {
  const front = textValue(payload.front_path, "신분증 앞면", 500);
  const back = textValue(payload.back_path, "신분증 뒷면", 500);
  const selfie = textValue(payload.selfie_path, "셀카", 500);
  if (!isKycPathForDocumentKind(userId, front, "identity_front")
    || !isKycPathForDocumentKind(userId, back, "identity_back")
    || !isKycPathForDocumentKind(userId, selfie, "selfie")) {
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

Deno.serve(async (request: Request, info) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    const user = await authenticate(request);
    const payload = await parseRequest(request);
    const action = String(payload.action || "");
    const ip = clientIp(request, info);
    const revealLike = action === "deposit_info_reveal"
      || action === "reveal"
      || payload.reveal === true
      || payload.reveal === "1";
    if (request.method === "GET" && revealLike) {
      throw new HttpError(403, "🔐 보안 PIN 입력 후 입금 안내 확인", DEPOSIT_INFO_PIN_REQUIRED);
    }

    const finance = financeActionGuard({
      open: isFinanceApiOpen(Deno.env.get("PUTDUK_ENABLE_FINANCE_API")),
      action,
      amount: payload.amount,
      includePrincipal: payload.include_principal,
      kind: payload.kind || payload.withdraw_kind,
      currency: payload.currency
    });
    if (!finance.ok) {
      throw new HttpError(finance.status, finance.message, finance.code);
    }

    if (action === "record_session") {
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

    if (action === "set_security_pin" || action === "security_pin_set") {
      return jsonResponse(request, { ok: true, ...(await setSecurityPin(admin, user.id, payload, ip)) });
    }

    if (
      action === "deposit_destinations"
      || action === "deposit_info_challenge"
      || action === "deposit_info"
    ) {
      const challenge = await listDepositDestinations(user.id, ip);
      return jsonResponse(request, { ok: true, ...challenge, destinations: challenge.destinations });
    }

    if (action === "deposit_info_reveal") {
      if (request.method !== "POST") {
        throw new HttpError(403, "🔐 보안 PIN 입력 후 입금 안내 확인", DEPOSIT_INFO_PIN_REQUIRED);
      }
      return jsonResponse(request, { ok: true, ...(await revealDepositInfo(admin, user.id, payload, ip)) });
    }

    if (action === "deposit_info_lock") {
      return jsonResponse(request, { ok: true, ...(await lockDepositInfo(admin, user.id, payload, ip)) });
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

    if (action === "checkpoint_work" || action === "save_checkpoint") {
      return jsonResponse(request, { ok: true, run: await checkpointWork(user.id, payload) });
    }

    if (action === "submit_work" || action === "submit_task" || action === "submit_run") {
      return jsonResponse(request, { ok: true, run: await submitWork(user.id, payload) });
    }

    if (action === "wallet" || action === "wallet_snapshot") {
      return jsonResponse(request, { ok: true, wallet: await walletSnapshot(user.id) });
    }

    if (action === "daily_task_quota" || action === "work_quota") {
      return jsonResponse(request, { ok: true, quota: await dailyTaskQuota(user.id) });
    }

    if (action === "submit_withdrawal" || action === "withdraw_request") {
      return jsonResponse(request, { ok: true, withdrawal: await submitWithdrawal(user.id, payload) }, 201);
    }

    if (action === "submit_kyc") {
      return jsonResponse(request, { ok: true, ...(await submitKyc(user.id, payload)) });
    }

    throw new HttpError(404, "지원하지 않는 요청입니다.");
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, { ok: false, error: error.message, code: error.code || undefined }, error.status);
    }
    console.error("member-finance error", error);
    return jsonResponse(request, { ok: false, error: "요청을 처리하지 못했어요." }, 500);
  }
});
