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
check SUPABASE_DB_PASSWORD
check PUTDUK_PAYOUT_SECRET
check PUTDUK_ALLOWED_ORIGINS

EXPECTED_REF="${PUTDUK_EXPECTED_PROJECT_REF:-gaugwamwceqdnqdqrxqg}"
if [ -n "${SUPABASE_PROJECT_REF:-}" ] && [ "${SUPABASE_PROJECT_REF}" != "${EXPECTED_REF}" ]; then
  echo "::error::SUPABASE_PROJECT_REF does not match the expected production project"
  fail=1
fi

if [ -n "${PUTDUK_ALLOWED_ORIGINS:-}" ]; then
  IFS=',' read -r -a cors_origins <<< "${PUTDUK_ALLOWED_ORIGINS}"
  for origin in "${cors_origins[@]}"; do
    origin="${origin#${origin%%[![:space:]]*}}"
    origin="${origin%${origin##*[![:space:]]}}"
    if [ "$origin" = "*" ]; then
      echo "::error::PUTDUK_ALLOWED_ORIGINS wildcard is forbidden for production"
      fail=1
      break
    fi
    if [[ ! "$origin" =~ ^https://[^/]+$ ]]; then
      echo "::error::PUTDUK_ALLOWED_ORIGINS must contain only origin-only HTTPS URLs"
      fail=1
      break
    fi
  done
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "Secret preflight: PASS"
