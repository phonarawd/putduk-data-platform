import assert from "node:assert/strict";
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
assert.equal(isOwnStoragePath(userId, `other/${userId}/kyc/front.jpg`), false);
assert.equal(isOwnStoragePath(userId, `${userId}/../secret.jpg`), false);
assert.equal(maskAccount("국민은행", "123456789012"), "국민은행 ****9012");
assert.equal(maskUsdt("TABCDEFGHIJKLMNOPQRSTUV"), "TABCDE…STUV");
assert.equal(REFERRAL_REWARD_KRW, 5000);
assert.equal(SIGNED_URL_SECONDS, 60);
assert.equal(PRIVATE_BUCKET, "putduk-private");

console.log("backend-guards: 통과");
