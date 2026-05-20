#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:20120}"
paths=("/" "/positions" "/pnl" "/candidates" "/strategy")

fail=0
for p in "${paths[@]}"; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' "${BASE_URL}${p}")
  echo "${p} -> ${code}"
  if [[ "$code" != "200" ]]; then
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "dashboard smoke FAILED" >&2
  exit 1
fi

echo "dashboard smoke OK"
