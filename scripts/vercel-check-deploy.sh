#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://mystats-eta.vercel.app/}"

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

HTML="$(curl -fsSL "${URL}")"
JS_PATH="$(
  printf '%s' "${HTML}" \
    | grep -Eo 'src="[^"]*/assets/index-[^"]+\.js"' \
    | head -n 1 \
    | sed -E 's/^src="//; s/"$//' \
    || true
)"

if [[ -z "${JS_PATH}" ]]; then
  echo "Error: Could not find assets/index-*.js in HTML from ${URL}" >&2
  exit 1
fi

if [[ "${JS_PATH}" == /* ]]; then
  JS_URL="${URL%/}${JS_PATH}"
else
  JS_URL="${URL%/}/${JS_PATH}"
fi

echo "URL: ${URL}"
echo "Bundle: ${JS_URL}"

has_literal_in_bundle() {
  local needle="$1"
  if command -v rg >/dev/null 2>&1; then
    set +o pipefail
    curl -fsSL "${JS_URL}" 2>/dev/null | rg -Fq "${needle}"
    local status=$?
    set -o pipefail
    return "${status}"
  else
    set +o pipefail
    curl -fsSL "${JS_URL}" 2>/dev/null | grep -Fq "${needle}"
    local status=$?
    set -o pipefail
    return "${status}"
  fi
}

if has_literal_in_bundle "cloudSignInGoogle" || has_literal_in_bundle "cloudSignInGithub"; then
  echo "Detected: NEW Cloud Sync auth UI (OAuth + Email/Password)"
  exit 0
fi

if has_literal_in_bundle "cloudSendLink"; then
  echo "Detected: OLD Cloud Sync auth UI (magic link)"
  exit 0
fi

echo "Detected: unknown (neither new nor old keys found)"
