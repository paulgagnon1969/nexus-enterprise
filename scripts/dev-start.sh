#!/usr/bin/env bash
set -euo pipefail

# Dev startup script for Nexus Enterprise
# - Ensures web points to local API
# - Ensures Cloud SQL Auth Proxy is running for dev
# - Starts API dev server (Cloud SQL via proxy)
# - Starts API worker
# - Starts Next.js web dev server

# Resolve repo root relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
WEB_ENV="$REPO_ROOT/apps/web/.env.local"

# Configurable (override via env if needed)
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-nexus-enterprise-480610:us-central1:nexusdev-v2}"
DEV_DB_PORT="${DEV_DB_PORT:-5434}"
DEV_DB_NAME="${DEV_DB_NAME:-nexus_db}"
DEV_DB_USER="${DEV_DB_USER:-postgres}"

mkdir -p "$LOG_DIR"

echo "[dev-start] Repo root: $REPO_ROOT" | tee -a "$LOG_DIR/dev-start.log"

# --- Sanity checks ---------------------------------------------------------

if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
  echo "[dev-start] ERROR: DEV_DB_PASSWORD is not set. Export it before running this script." | tee -a "$LOG_DIR/dev-start.log" >&2
  exit 1
fi

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "[dev-start] ERROR: cloud-sql-proxy is not on PATH. Install it or add it to PATH." | tee -a "$LOG_DIR/dev-start.log" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[dev-start] ERROR: npm is not on PATH. Ensure Node/npm are installed." | tee -a "$LOG_DIR/dev-start.log" >&2
  exit 1
fi

# If we're using Application Default Credentials (no explicit credential_file),
# enforce that gcloud is pointed at the correct project. This avoids confusing
# "invalid_grant" / permission errors when the ADC project is wrong.
if [[ -z "${CLOUD_SQL_PROXY_CREDENTIAL_FILE:-}" ]]; then
  if command -v gcloud >/dev/null 2>&1; then
    GCLOUD_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
    if [[ "$GCLOUD_PROJECT" != "nexus-enterprise-480610" ]]; then
      echo "[dev-start] ERROR: gcloud project is '$GCLOUD_PROJECT', expected 'nexus-enterprise-480610'." | tee -a "$LOG_DIR/dev-start.log" >&2
      echo "[dev-start] Run: gcloud config set project nexus-enterprise-480610" | tee -a "$LOG_DIR/dev-start.log" >&2
      exit 1
    fi
  else
    echo "[dev-start] WARNING: gcloud is not installed; Cloud SQL proxy will fall back to whatever ADC is available." | tee -a "$LOG_DIR/dev-start.log" >&2
  fi
fi

# --- 1) Ensure web .env.local points to local API -------------------------

if [[ ! -f "$WEB_ENV" ]]; then
  cat > "$WEB_ENV" << 'EOF'
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF
  echo "[dev-start] Created apps/web/.env.local pointing to http://localhost:8000" | tee -a "$LOG_DIR/dev-start.log"
fi

# --- 2) Start / ensure Cloud SQL proxy on DEV_DB_PORT ---------------------

if pgrep -f "cloud-sql-proxy.*${CLOUD_SQL_INSTANCE}.*${DEV_DB_PORT}" >/dev/null 2>&1; then
  echo "[dev-start] Cloud SQL proxy already running for $CLOUD_SQL_INSTANCE on port $DEV_DB_PORT" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting Cloud SQL proxy for $CLOUD_SQL_INSTANCE on 127.0.0.1:${DEV_DB_PORT}" | tee -a "$LOG_DIR/dev-start.log"

  if [[ -z "${CLOUD_SQL_PROXY_CREDENTIAL_FILE:-}" ]]; then
    echo "[dev-start] WARNING: CLOUD_SQL_PROXY_CREDENTIAL_FILE is not set; using Application Default Credentials" | tee -a "$LOG_DIR/dev-start.log"
    nohup cloud-sql-proxy \
      --port="${DEV_DB_PORT}" \
      "${CLOUD_SQL_INSTANCE}" \
      > "$LOG_DIR/cloud-sql-proxy.log" 2>&1 &
  else
    nohup cloud-sql-proxy \
      --port="${DEV_DB_PORT}" \
      --credential_file="${CLOUD_SQL_PROXY_CREDENTIAL_FILE}" \
      "${CLOUD_SQL_INSTANCE}" \
      > "$LOG_DIR/cloud-sql-proxy.log" 2>&1 &
  fi

  echo "[dev-start] Waiting 5 seconds for Cloud SQL proxy to initialize..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

export DATABASE_URL="postgresql://${DEV_DB_USER}:${DEV_DB_PASSWORD}@127.0.0.1:${DEV_DB_PORT}/${DEV_DB_NAME}"
# Obfuscate password in log output
SANITIZED_DB_URL="${DATABASE_URL/${DEV_DB_PASSWORD}/****}"
echo "[dev-start] Using DATABASE_URL=${SANITIZED_DB_URL}" | tee -a "$LOG_DIR/dev-start.log"

# --- 3) Start API dev server ----------------------------------------------

if pgrep -f "scripts/dev-api-cloud-db.sh" >/dev/null 2>&1; then
  echo "[dev-start] API dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API dev server (Cloud SQL via proxy)..." | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT"
    nohup bash ./scripts/dev-api-cloud-db.sh \
      > "$LOG_DIR/api-dev.log" 2>&1 &
  )
  echo "[dev-start] Waiting 5 seconds for API dev to boot..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# --- 4) Start API worker (BullMQ) ----------------------------------------

if pgrep -f "apps/api.*src/worker.ts" >/dev/null 2>&1; then
  echo "[dev-start] API worker already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API worker (import jobs)..." | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT/apps/api"
    nohup npm run worker:dev \
      > "$LOG_DIR/api-worker-dev.log" 2>&1 &
  )
fi

# --- 5) Start web dev server ---------------------------------------------

if pgrep -f "next dev -p 3000" >/dev/null 2>&1; then
  echo "[dev-start] Web dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting web dev server on http://localhost:3000..." | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT/apps/web"
    nohup npm run dev \
      > "$LOG_DIR/web-dev.log" 2>&1 &
  )
fi

echo "[dev-start] Done. Check $LOG_DIR for logs." | tee -a "$LOG_DIR/dev-start.log"
