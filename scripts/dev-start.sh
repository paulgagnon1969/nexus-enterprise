#!/usr/bin/env bash
set -euo pipefail

# Simple dev startup script for Nexus Enterprise
# - Starts Cloud SQL Auth Proxy for dev
# - Starts API dev server pointed at Cloud SQL dev via proxy
# - Starts Next.js web dev server pointing at http://localhost:3000

REPO_ROOT="/Users/pg/nexus-enterprise"
LOG_DIR="$REPO_ROOT/logs"

mkdir -p "$LOG_DIR"

# In local dev we now expect a real Redis (e.g. Homebrew on localhost:6379)
# so keep REDIS_URL intact for BullMQ import jobs.

# 1) Ensure web .env.local points to local API
WEB_ENV="$REPO_ROOT/apps/web/.env.local"
if [ ! -f "$WEB_ENV" ]; then
  cat > "$WEB_ENV" << 'EOF'
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF
  echo "[dev-start] Created apps/web/.env.local pointing to http://localhost:8000" | tee -a "$LOG_DIR/dev-start.log"
fi

# 2) Start Cloud SQL Auth Proxy for dev (if not already running)
# Uses a dedicated service account key for stable local auth. Set
# CLOUD_SQL_PROXY_CREDENTIAL_FILE in your shell (e.g. ~/.zshrc):
#   export CLOUD_SQL_PROXY_CREDENTIAL_FILE="$HOME/.gcp-keys/nexus-dev-proxy-key.json"
# Updated to use the new dev instance (nexusdev-v2) on port 5434.
if pgrep -f "cloud-sql-proxy --port=5434 nexus-enterprise-480610:us-central1:nexusdev-v2" >/dev/null 2>&1; then
  echo "[dev-start] Cloud SQL proxy already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting Cloud SQL proxy on 127.0.0.1:5434 (dev instance nexusdev-v2)" | tee -a "$LOG_DIR/dev-start.log"
  if [[ -z "${CLOUD_SQL_PROXY_CREDENTIAL_FILE:-}" ]]; then
    echo "[dev-start] WARNING: CLOUD_SQL_PROXY_CREDENTIAL_FILE is not set; falling back to Application Default Credentials" | tee -a "$LOG_DIR/dev-start.log"
    nohup /opt/homebrew/bin/cloud-sql-proxy --port=5434 nexus-enterprise-480610:us-central1:nexusdev-v2 \
      > "$LOG_DIR/cloud-sql-proxy.log" 2>&1 &
  else
    nohup /opt/homebrew/bin/cloud-sql-proxy \
      --port=5434 \
      --credential_file="$CLOUD_SQL_PROXY_CREDENTIAL_FILE" \
      nexus-enterprise-480610:us-central1:nexusdev-v2 \
      > "$LOG_DIR/cloud-sql-proxy.log" 2>&1 &
  fi
  echo "[dev-start] Waiting 5 seconds for Cloud SQL proxy to initialize..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# 3) Start API dev server (Cloud SQL dev via proxy)
if pgrep -f "scripts/dev-api-cloud-db.sh" >/dev/null 2>&1; then
  echo "[dev-start] API dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API dev server (Cloud SQL dev via proxy)" | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT"
    if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
      echo "[dev-start] DEV_DB_PASSWORD is not set. Export it in your shell before running this script." | tee -a "$LOG_DIR/dev-start.log"
      exit 1
    fi
    export DATABASE_URL="postgresql://postgres:${DEV_DB_PASSWORD}@127.0.0.1:5434/nexus_db"
    nohup bash ./scripts/dev-api-cloud-db.sh \
      > "$LOG_DIR/api-dev.log" 2>&1 &
  )
  echo "[dev-start] Waiting 5 seconds for API dev server to boot before starting web..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# 4) Start API worker (BullMQ import jobs)
if pgrep -f "src/worker.ts" >/dev/null 2>&1; then
  echo "[dev-start] API worker already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API worker (import jobs)" | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT"
    if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
      echo "[dev-start] DEV_DB_PASSWORD is not set. Export it in your shell before running this script." | tee -a "$LOG_DIR/dev-start.log"
      exit 1
    fi
    export DATABASE_URL="postgresql://postgres:${DEV_DB_PASSWORD}@127.0.0.1:5434/nexus_db"
    cd "$REPO_ROOT/apps/api"
    nohup /usr/local/bin/npm run worker:dev \
      > "$LOG_DIR/api-worker-dev.log" 2>&1 &
  )
fi

# 5) Start web dev server
if pgrep -f "next dev -p 3000" >/dev/null 2>&1; then
  echo "[dev-start] Web dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting web dev server on http://localhost:3000" | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT/apps/web"
    nohup /usr/local/bin/npm run dev \
      > "$LOG_DIR/web-dev.log" 2>&1 &
  )
fi

echo "[dev-start] Done. Check $LOG_DIR for logs." | tee -a "$LOG_DIR/dev-start.log"
