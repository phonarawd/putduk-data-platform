#!/usr/bin/env bash
# GitHub Actions Secret preflight. 원문·길이는 출력하지 않는다.
set -eu
if [ -n "${BASH_VERSION:-}" ]; then
  set +o xtrace
fi

fail=0
check() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "::error::${name} is missing"
    fail=1
  fi
}

check SUPABASE_ACCESS_TOKEN
check SUPABASE_PROJECT_REF
check PUTDUK_PAYOUT_SECRET

EXPECTED_REF="${PUTDUK_EXPECTED_PROJECT_REF:-gaugwamwceqdnqdqrxqg}"
if [ -n "${SUPABASE_PROJECT_REF:-}" ] && [ "${SUPABASE_PROJECT_REF}" != "${EXPECTED_REF}" ]; then
  echo "::error::SUPABASE_PROJECT_REF does not match the expected production project"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "Secret preflight: PASS"
