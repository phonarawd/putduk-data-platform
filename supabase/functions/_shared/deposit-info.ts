// 입금 안내 PIN 챌린지·공개·잠금. 금액은 바꾸지 않는다.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { HttpError, type JsonRecord } from "./http.ts";
import { maskAccount, maskUsdt, PRIVATE_BUCKET, SIGNED_URL_SECONDS } from "./validate.ts";
import {
  challengePayload,
  DEPOSIT_INFO_LOCKED,
  DEPOSIT_INFO_PIN_REQUIRED,
  DEPOSIT_INFO_TOKEN_INVALID,
  DEPOSIT_PIN_POLICY,
  hashIp,
  hashPin,
  hashToken,
  isPinLocked,
  isSixDigitPin,
  newRevealToken,
  PIN_SCOPES,
  registerPinFailure,
  verifyPin
} from "./deposit-pin.ts";

type AdminClient = SupabaseClient;

async function rpcCall<T>(
  admin: AdminClient,
  fn: string,
  args: JsonRecord,
  failMessage?: string
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    console.error(fn, error);
    if (failMessage) throw new HttpError(503, failMessage);
  }
  return data as T;
}

async function writeAudit(
  admin: AdminClient,
  userId: string | null,
  actorId: string | null,
  event: string,
  scope: string | null,
  ipHash: string | null,
  meta: JsonRecord | null = null
) {
  await rpcCall(admin, "putduk_security_pin_audit_write", {
    p_user_id: userId,
    p_actor_id: actorId,
    p_event: event,
    p_scope: scope,
    p_ip_hash: ipHash,
    p_meta: meta
  });
}

async function catalogVersion(admin: AdminClient): Promise<number> {
  const version = await rpcCall<number>(
    admin,
    "putduk_deposit_catalog_version",
    {},
    "입금 안내 버전을 확인하지 못했어요."
  );
  return Number(version || 1);
}

async function enabledDestinations(admin: AdminClient) {
  const data = await rpcCall<JsonRecord[]>(
    admin,
    "putduk_list_enabled_payout_destinations",
    {},
    "입금 안내를 불러오지 못했습니다."
  );
  return Array.isArray(data) ? data : [];
}

async function fullEnabledDestinations(admin: AdminClient) {
  const data = await rpcCall<JsonRecord[]>(
    admin,
    "putduk_deposit_destinations_full",
    {},
    "입금 안내를 불러오지 못했습니다."
  );
  return Array.isArray(data) ? data : [];
}

async function loadPin(admin: AdminClient, userId: string) {
  const data = await rpcCall<JsonRecord | null>(
    admin,
    "putduk_security_pin_get",
    { p_user_id: userId },
    "보안 PIN 상태를 확인하지 못했어요."
  );
  return data && typeof data === "object" ? data : null;
}

async function loadIpLock(admin: AdminClient, ipHash: string | null) {
  if (!ipHash) return null;
  const data = await rpcCall<JsonRecord | null>(admin, "putduk_security_pin_ip_get", { p_ip_hash: ipHash });
  return data && typeof data === "object" ? data : null;
}

function assertNotLocked(userRow: JsonRecord | null, ipRow: JsonRecord | null) {
  if (isPinLocked(userRow?.locked_until as string | null) || isPinLocked(ipRow?.locked_until as string | null)) {
    throw new HttpError(423, "🔒 보안 PIN이 잠시 잠겨 있어요. 15분 뒤에 다시 시도해 주세요.", DEPOSIT_INFO_LOCKED);
  }
}

async function recordFailure(
  admin: AdminClient,
  userId: string,
  userRow: JsonRecord | null,
  ipHash: string | null,
  ipRow: JsonRecord | null
) {
  const now = new Date();
  const userFail = registerPinFailure(Number(userRow?.failed_attempts || 0), now);
  const ipFail = registerPinFailure(Number(ipRow?.failed_attempts || 0), now);
  if (userRow?.pin_hash && userRow.pin_hash !== "pending") {
    await rpcCall(admin, "putduk_security_pin_set_failures", {
      p_user_id: userId,
      p_failed_attempts: userFail.failedAttempts,
      p_locked_until: userFail.lockedUntil ? userFail.lockedUntil.toISOString() : null
    });
  }
  if (ipHash) {
    await rpcCall(admin, "putduk_security_pin_ip_upsert", {
      p_ip_hash: ipHash,
      p_failed_attempts: ipFail.failedAttempts,
      p_locked_until: ipFail.lockedUntil ? ipFail.lockedUntil.toISOString() : null
    });
  }
  await writeAudit(admin, userId, userId, userFail.locked || ipFail.locked ? "pin_lock" : "pin_fail", PIN_SCOPES.DEPOSIT_INFO_REVEAL, ipHash, {
    remaining: Math.min(userFail.remaining, ipFail.remaining)
  });
  if (userFail.locked || ipFail.locked) {
    throw new HttpError(423, "🔒 보안 PIN을 여러 번 틀려서 잠시 잠갔어요. 15분 뒤에 다시 해 주세요.", DEPOSIT_INFO_LOCKED);
  }
  throw new HttpError(403, `🙂 보안 PIN이 올바르지 않아요. ${userFail.remaining}번 더 시도할 수 있어요.`, DEPOSIT_INFO_PIN_REQUIRED);
}

async function clearFailures(admin: AdminClient, userId: string, ipHash: string | null) {
  await rpcCall(admin, "putduk_security_pin_set_failures", {
    p_user_id: userId,
    p_failed_attempts: 0,
    p_locked_until: null
  });
  if (ipHash) {
    await rpcCall(admin, "putduk_security_pin_ip_upsert", {
      p_ip_hash: ipHash,
      p_failed_attempts: 0,
      p_locked_until: null
    });
  }
}

async function signQr(admin: AdminClient, path: unknown) {
  const value = String(path || "").trim();
  if (!value) return null;
  const { data, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(value, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function setSecurityPin(
  admin: AdminClient,
  userId: string,
  payload: JsonRecord,
  ip: string | null
) {
  const pin = String(payload.pin || payload.new_pin || "");
  const current = String(payload.current_pin || payload.old_pin || "");
  if (!isSixDigitPin(pin)) throw new HttpError(400, "보안 PIN은 숫자 6자리여야 해요.");
  const existing = await loadPin(admin, userId);
  const ipHash = await hashIp(ip);
  if (existing?.pin_hash && existing.pin_hash !== "pending") {
    assertNotLocked(existing, await loadIpLock(admin, ipHash));
    const ipRow = await loadIpLock(admin, ipHash);
    if (!isSixDigitPin(current) || !await verifyPin(current, String(existing.pin_hash))) {
      await recordFailure(admin, userId, existing, ipHash, ipRow);
    }
  }
  const pinHash = await hashPin(pin);
  await rpcCall(
    admin,
    "putduk_security_pin_upsert",
    {
      p_user_id: userId,
      p_pin_hash: pinHash,
      p_failed_attempts: 0,
      p_locked_until: null
    },
    "보안 PIN을 저장하지 못했어요."
  );
  await writeAudit(admin, userId, userId, "pin_set", PIN_SCOPES.DEPOSIT_INFO_REVEAL, ipHash, { kdf: "scrypt" });
  return { saved: true, scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL };
}

export async function challengeDepositInfo(
  admin: AdminClient,
  userId: string,
  ip: string | null
) {
  const destinations = await enabledDestinations(admin);
  const pinRow = await loadPin(admin, userId);
  const version = await catalogVersion(admin);
  const ipHash = await hashIp(ip);
  const ipRow = await loadIpLock(admin, ipHash);
  const lockedUntil = isPinLocked(pinRow?.locked_until as string | null)
    ? pinRow?.locked_until
    : ipRow?.locked_until;
  return challengePayload({
    destinations,
    pinSet: Boolean(pinRow?.pin_hash && pinRow.pin_hash !== "pending"),
    lockedUntil: lockedUntil as string | null,
    catalogVersion: version
  });
}

export async function revealDepositInfo(
  admin: AdminClient,
  userId: string,
  payload: JsonRecord,
  ip: string | null
) {
  if (String(payload.scope || PIN_SCOPES.DEPOSIT_INFO_REVEAL) !== PIN_SCOPES.DEPOSIT_INFO_REVEAL) {
    throw new HttpError(403, "출금 확인과 입금 안내 공개는 따로 잠겨 있어요.", DEPOSIT_INFO_TOKEN_INVALID);
  }
  const pin = String(payload.pin || "");
  if (!isSixDigitPin(pin)) {
    throw new HttpError(403, "🔐 보안 PIN 입력 후 입금 안내 확인", DEPOSIT_INFO_PIN_REQUIRED);
  }
  const pinRow = await loadPin(admin, userId);
  const version = await catalogVersion(admin);
  const ipHash = await hashIp(ip);
  const ipRow = await loadIpLock(admin, ipHash);
  assertNotLocked(pinRow, ipRow);
  if (!pinRow?.pin_hash || pinRow.pin_hash === "pending") {
    throw new HttpError(409, "보안 PIN을 먼저 만들어 주세요.", "DEPOSIT_INFO_PIN_UNSET");
  }
  if (!await verifyPin(pin, String(pinRow.pin_hash))) {
    await recordFailure(admin, userId, pinRow, ipHash, ipRow);
  }
  await clearFailures(admin, userId, ipHash);
  await rpcCall(admin, "putduk_deposit_reveal_tokens_lock", {
    p_user_id: userId,
    p_scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
    p_token_hash: null
  });

  const minted = await newRevealToken();
  await rpcCall(
    admin,
    "putduk_deposit_reveal_token_insert",
    {
      p_user_id: userId,
      p_token_hash: minted.tokenHash,
      p_scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
      p_catalog_version: version,
      p_expires_at: minted.expiresAt.toISOString()
    },
    "입금 안내를 잠시 열지 못했어요."
  );

  const rows = await fullEnabledDestinations(admin);
  const destinations = [];
  for (const row of rows) {
    const type = String(row.destination_type || "bank");
    const account = String(row.account_number || (type === "bank" ? row.encrypted_value : "") || "");
    const usdt = String(row.usdt_address || (type === "usdt" ? row.encrypted_value : "") || "");
    destinations.push({
      id: row.id,
      destination_type: type,
      label: row.label,
      bank_name: row.bank_name,
      account_holder: row.account_holder,
      account_number: account || null,
      masked_value: row.masked_value || (type === "usdt" ? maskUsdt(usdt) : maskAccount(String(row.bank_name || ""), account)),
      usdt_network: row.usdt_network || (type === "usdt" ? "TRC20" : null),
      usdt_address: usdt || null,
      memo: row.memo || null,
      guidance_text: row.guidance_text || null,
      qr_signed_url: await signQr(admin, row.qr_asset_path),
      info_version: row.info_version,
      address_mode: type === "usdt" ? "operator_fixed" : null
    });
  }

  await writeAudit(admin, userId, userId, "reveal", PIN_SCOPES.DEPOSIT_INFO_REVEAL, ipHash, {
    catalog_version: version,
    count: destinations.length
  });

  await rpcCall(admin, "putduk_deposit_reveal_token_consume", { p_token_hash: minted.tokenHash });

  return {
    token: minted.token,
    expires_in: DEPOSIT_PIN_POLICY.revealTtlSeconds,
    expires_at: minted.expiresAt.toISOString(),
    catalog_version: version,
    scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
    address_mode: "operator_fixed",
    destinations
  };
}

export async function lockDepositInfo(
  admin: AdminClient,
  userId: string,
  payload: JsonRecord,
  ip: string | null
) {
  const token = String(payload.token || "").trim();
  const ipHash = await hashIp(ip);
  await rpcCall(
    admin,
    "putduk_deposit_reveal_tokens_lock",
    {
      p_user_id: userId,
      p_scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
      p_token_hash: token ? await hashToken(token) : null
    },
    "입금 안내를 다시 잠그지 못했어요."
  );
  await writeAudit(admin, userId, userId, "lock", PIN_SCOPES.DEPOSIT_INFO_REVEAL, ipHash, {
    token_bound: Boolean(token)
  });
  return { locked: true };
}

export async function resetSecurityPin(
  admin: AdminClient,
  adminId: string,
  memberId: string,
  reason: string | null
) {
  await rpcCall(admin, "putduk_security_pin_delete", { p_user_id: memberId });
  await rpcCall(admin, "putduk_deposit_reveal_tokens_lock", {
    p_user_id: memberId,
    p_scope: PIN_SCOPES.DEPOSIT_INFO_REVEAL,
    p_token_hash: null
  });
  await writeAudit(admin, memberId, adminId, "pin_reset", PIN_SCOPES.DEPOSIT_INFO_REVEAL, null, {
    reason,
    note: "운영자는 PIN 원문을 볼 수 없고 재설정만 합니다."
  });
  return { reset: true };
}

export async function listSecurityPinAudit(admin: AdminClient, adminId: string) {
  const data = await rpcCall<JsonRecord[]>(
    admin,
    "putduk_admin_security_pin_audit_list",
    { p_admin_id: adminId },
    "보안 PIN 기록을 불러오지 못했어요."
  );
  return Array.isArray(data) ? data : [];
}
