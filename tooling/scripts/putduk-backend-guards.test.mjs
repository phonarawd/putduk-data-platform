import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAmountInRange,
  isOwnStoragePath,
  isSixDigitPin,
  isSupportedCurrency,
  isUuid,
  isValidSlug,
  maskAccount,
  maskUsdt,
  PRIVATE_BUCKET,
  REFERRAL_REWARD_KRW,
  SIGNED_URL_SECONDS
} from "./putduk-backend-guards.mjs";

const userId = "11111111-1111-4111-8111-111111111111";

assert.equal(isUuid(userId), true);
assert.equal(isUuid("not-a-uuid"), false);
assert.equal(isSixDigitPin("123456"), true);
assert.equal(isSixDigitPin("12345"), false);
assert.equal(isSixDigitPin("1234567"), false);
assert.equal(isSixDigitPin("12a456"), false);
assert.equal(isSupportedCurrency("krw"), true);
assert.equal(isSupportedCurrency("BTC"), false);
assert.equal(isValidSlug("cj-logistics"), true);
assert.equal(isValidSlug("CJ"), false);
assert.equal(isAmountInRange(1000), true);
assert.equal(isAmountInRange(999), false);
assert.equal(isOwnStoragePath(userId, `${userId}/kyc/front.jpg`), true);
assert.equal(isOwnStoragePath(userId, `kyc/${userId}/front.jpg`), true);
assert.equal(isOwnStoragePath(userId, `deposit-proof/${userId}/slip.png`), true);
assert.equal(isOwnStoragePath(userId, `other/${userId}/kyc/front.jpg`), false);
assert.equal(isOwnStoragePath(userId, `${userId}/../secret.jpg`), false);
assert.equal(maskAccount("국민은행", "123456789012"), "국민은행 ****9012");
assert.equal(maskUsdt("TABCDEFGHIJKLMNOPQRSTUV"), "TABCDE…STUV");
assert.equal(REFERRAL_REWARD_KRW, 5000);
assert.equal(SIGNED_URL_SECONDS, 60);
assert.equal(PRIVATE_BUCKET, "putduk-private");

// 운영 어드민은 admin-master를 호출한다. 현재 엔드포인트와 admin-phase5 호환 함수가 JWT 검증/배포/스모크 대상에서
// 빠지면 프런트와 운영 Edge 배포 계약이 어긋나므로 정적 회귀 검사로 막는다.
const supabaseConfig = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
const deployWorkflow = readFileSync(new URL("../../.github/workflows/supabase-deploy.yml", import.meta.url), "utf8");
const edgeEnv = readFileSync(new URL("../supabase/lib/load-env.mjs", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../../dist/admin/index.html", import.meta.url), "utf8");

for (const functionName of ["admin-control", "admin-phase5", "admin-master", "member-finance", "member-push", "push-dispatch"]) {
  if (functionName === "push-dispatch") {
    assert.match(supabaseConfig, /\[functions\.push-dispatch\]\s+verify_jwt\s*=\s*false/, "push-dispatch must skip gateway JWT verification");
    assert.match(deployWorkflow, new RegExp(`supabase functions deploy ${functionName}\\b`), `${functionName} must be deployed by the production workflow`);
    continue;
  }
  assert.match(supabaseConfig, new RegExp(`\\[functions\\.${functionName}\\]\\s+verify_jwt\\s*=\\s*true`), `${functionName} must require gateway JWT verification`);
  assert.match(deployWorkflow, new RegExp(`supabase functions deploy ${functionName}\\b`), `${functionName} must be deployed by the production workflow`);
  assert.match(edgeEnv, new RegExp(`["]${functionName}["]`), `${functionName} must be included in Edge smoke verification`);
}
assert.match(adminHtml, /functions\/v1\/admin-master/, "admin UI must use the verified admin-master endpoint");

console.log("backend-guards: 통과");
