#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper to deploy Nexus API to production using a local, git-ignored
# env file (e.g. $HOME/.nexus-prod-env) that defines the required variables.
#
# Expected variables (typically defined in $HOME/.nexus-prod-env):
#   PROJECT_ID     - GCP project ID for prod (e.g. nexus-enterprise-480610)
#   REGION         - Cloud Run region (e.g. us-central1)
#   SERVICE        - Cloud Run service name (e.g. nexus-api)
#   DATABASE_URL   - Prod Postgres connection URL for Prisma
#
# Usage:
#   1) Create $HOME/.nexus-prod-env with the variables above.
#   2) Run: ./scripts/deploy-api-prod-env.sh
#
# NOTE: $HOME/.nexus-prod-env MUST NOT be checked into git.

# Load local prod env if present
if [[ -f "$HOME/.nexus-prod-env" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nexus-prod-env"
fi

# Basic validation so failures are explicit
missing=()
[[ -z "${PROJECT_ID:-}" ]] && missing+=("PROJECT_ID")
[[ -z "${REGION:-}" ]] && missing+=("REGION")
[[ -z "${SERVICE:-}" ]] && missing+=("SERVICE")
[[ -z "${DATABASE_URL:-}" ]] && missing+=("DATABASE_URL")

if (( ${#missing[@]} > 0 )); then
  echo "[deploy-api-prod-env] ERROR: Missing required env vars: ${missing[*]}" >&2
  echo "Define them in $HOME/.nexus-prod-env or export them in your shell." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-api-prod-env] Deploying API to prod via deploy-api-prod.sh"
SANITIZED_DB_URL="${DATABASE_URL/*:\/\/*@/****@}"
echo "[deploy-api-prod-env] Using PROJECT_ID=${PROJECT_ID}, REGION=${REGION}, SERVICE=${SERVICE}"
echo "[deploy-api-prod-env] Using DATABASE_URL=${SANITIZED_DB_URL}"

export PROJECT_ID REGION SERVICE DATABASE_URL
"$ROOT_DIR/deploy-api-prod.sh"
