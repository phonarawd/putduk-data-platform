#!/usr/bin/env bash
# Cloudflare Secret preflight. 원문은 출력하지 않는다.
set -eu
if [ -n "${BASH_VERSION:-}" ]; then
  set +o xtrace
fi

fail=0
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "::error::CLOUDFLARE_API_TOKEN is missing"
  fail=1
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::error::CLOUDFLARE_ACCOUNT_ID is missing"
  fail=1
fi
if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "Cloudflare secret preflight: PASS"
