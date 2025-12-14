#!/usr/bin/env bash
set -euo pipefail

# Simple dev startup script for Nexus Enterprise
# - Starts Cloud SQL Auth Proxy for prod
# - Starts API dev server pointed at Cloud SQL prod via proxy
# - Starts Next.js web dev server pointing at http://localhost:8000

REPO_ROOT="/Users/pg/nexus-enterprise"
LOG_DIR="$REPO_ROOT/logs"

mkdir -p "$LOG_DIR"

# 1) Ensure web .env.local points to local API
WEB_ENV="$REPO_ROOT/apps/web/.env.local"
if [ ! -f "$WEB_ENV" ]; then
  cat > "$WEB_ENV" << 'EOF'
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF
  echo "[dev-start] Created apps/web/.env.local pointing to http://localhost:8000" | tee -a "$LOG_DIR/dev-start.log"
fi

# 2) Start Cloud SQL Auth Proxy for prod (if not already running)
if pgrep -f "cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexus-prod-postgres" >/dev/null 2>&1; then
  echo "[dev-start] Cloud SQL proxy already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting Cloud SQL proxy on 127.0.0.1:5433" | tee -a "$LOG_DIR/dev-start.log"
  nohup /opt/homebrew/bin/cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexus-prod-postgres \
    > "$LOG_DIR/cloud-sql-proxy.log" 2>&1 &
  echo "[dev-start] Waiting 5 seconds for Cloud SQL proxy to initialize..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# 3) Start API dev server (Cloud SQL prod via proxy)
if pgrep -f "scripts/dev-api-cloud-db.sh" >/dev/null 2>&1; then
  echo "[dev-start] API dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API dev server (Cloud SQL prod via proxy)" | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT"
    export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
    nohup bash ./scripts/dev-api-cloud-db.sh \
      > "$LOG_DIR/api-dev.log" 2>&1 &
  )
  echo "[dev-start] Waiting 5 seconds for API dev server to boot before starting web..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# 4) Start web dev server
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
