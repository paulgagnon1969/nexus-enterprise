#!/usr/bin/env bash
# scripts/gcp-ensure-auth.sh
#
# Source this before any GCP operation. It silently validates Application Default
# Credentials (ADC) and only triggers re-authentication when the refresh token
# has actually expired — typically once every few months.
#
# Usage (from other scripts):
#   source "$(dirname "${BASH_SOURCE[0]}")/gcp-ensure-auth.sh"
#
# Usage (standalone):
#   ./scripts/gcp-ensure-auth.sh          # just validate/refresh
#   ./scripts/gcp-ensure-auth.sh -- <cmd> # validate, then run cmd

_gcp_ensure_auth() {
  local PROJECT="${GCP_PROJECT:-nexus-enterprise-480610}"

  # 1. Ensure gcloud is installed
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "[gcp-auth] ERROR: gcloud CLI not found." >&2
    return 1
  fi

  # 2. Ensure gcloud account is active
  if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    echo "[gcp-auth] No active gcloud account. Logging in..." >&2
    gcloud auth login --update-adc --project="$PROJECT"
    return $?
  fi

  # 3. Check ADC validity (silent — just tries to mint an access token)
  if gcloud auth application-default print-access-token >/dev/null 2>&1; then
    return 0  # ADC is valid, nothing to do
  fi

  # 4. ADC expired or missing — refresh
  echo "[gcp-auth] ADC expired or missing. Refreshing (browser may open once)..." >&2
  gcloud auth application-default login --project="$PROJECT"
}

# Run automatically when sourced or executed directly
_gcp_ensure_auth

# If invoked directly with a command after --, run it
if [[ "${BASH_SOURCE[0]}" == "${0}" ]] && [[ "${1:-}" == "--" ]]; then
  shift
  exec "$@"
fi
