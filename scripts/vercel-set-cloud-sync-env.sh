#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-production}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI not found. Install it first." >&2
  exit 1
fi

if [[ "${ENV_NAME}" != "production" && "${ENV_NAME}" != "preview" && "${ENV_NAME}" != "development" ]]; then
  echo "Usage: $0 <production|preview|development>" >&2
  exit 1
fi

VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"

if [[ -z "${VITE_SUPABASE_URL}" && -n "${MYSTATS_SUPABASE_URL:-}" ]]; then
  VITE_SUPABASE_URL="${MYSTATS_SUPABASE_URL}"
fi

if [[ -z "${VITE_SUPABASE_ANON_KEY}" && -n "${MYSTATS_SUPABASE_ANON_KEY:-}" ]]; then
  VITE_SUPABASE_ANON_KEY="${MYSTATS_SUPABASE_ANON_KEY}"
fi

if [[ -z "${VITE_SUPABASE_URL}" ]]; then
  read -r -p "VITE_SUPABASE_URL: " VITE_SUPABASE_URL
fi

if [[ -z "${VITE_SUPABASE_ANON_KEY}" ]]; then
  read -r -s -p "VITE_SUPABASE_ANON_KEY: " VITE_SUPABASE_ANON_KEY
  echo
fi

if [[ "${VITE_SUPABASE_URL}" == *localhost* || "${VITE_SUPABASE_URL}" == *127.0.0.1* ]]; then
  if [[ "${ALLOW_LOCALHOST:-0}" != "1" ]]; then
    echo "Refusing localhost URL for Vercel. Use a hosted Supabase URL (or set ALLOW_LOCALHOST=1 to override)." >&2
    exit 1
  fi
fi

printf '%s\n' "${VITE_SUPABASE_URL}" | vercel env add VITE_SUPABASE_URL "${ENV_NAME}" --yes --force
printf '%s\n' "${VITE_SUPABASE_ANON_KEY}" | vercel env add VITE_SUPABASE_ANON_KEY "${ENV_NAME}" --yes --force --sensitive

echo "Done: added Cloud Sync env vars for '${ENV_NAME}'."
echo "Redeploy: push to main (or run 'vercel --prod')."
