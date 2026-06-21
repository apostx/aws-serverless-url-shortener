#!/usr/bin/env bash
# End-to-end smoke test against a deployed API base URL.
# Usage: scripts/smoke-test.sh <base-url>   (or set API_URL)
set -euo pipefail

BASE_URL="${1:-${API_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "usage: smoke-test.sh <base-url>" >&2
  exit 1
fi
BASE_URL="${BASE_URL%/}"

echo "Smoke testing ${BASE_URL}"

short_code=$(curl -fsS -X POST "${BASE_URL}/shorten" \
  -H 'content-type: application/json' \
  -d '{"originalUrl":"https://aws.amazon.com/lambda"}' |
  python3 -c 'import sys, json; print(json.load(sys.stdin)["shortCode"])')
echo "Created short code: ${short_code}"

status=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/${short_code}")
if [ "$status" != "302" ]; then
  echo "Expected 302 from redirect, got ${status}" >&2
  exit 1
fi
echo "Redirect returned 302"

clicks=$(curl -fsS "${BASE_URL}/stats/${short_code}" |
  python3 -c 'import sys, json; print(json.load(sys.stdin)["clicks"])')
echo "Stats endpoint reports clicks=${clicks}"

echo "Smoke test passed."
