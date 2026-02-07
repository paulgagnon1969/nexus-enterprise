#!/usr/bin/env bash
set -euo pipefail

# Dev startup script for Nexus Enterprise (LOCAL DOCKER DEV)
# - Ensures web points to local API
# - Ensures local Docker infra (Postgres + Redis) is running for dev
# - Starts API dev server against local Postgres
# - Starts API worker
# - Starts Next.js web dev server

# ──────────────────────────────────────────────────────────────
# Resolve repo root based on this script (not $PWD)
# ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try git first, anchored to the script directory
if command -v git >/dev/null 2>&1; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi

# Fallback if not in a git repo or git failed
if [[ -z "${REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Extra safety: ensure this looks like the Nexus Enterprise repo
if [[ ! -d "$REPO_ROOT/apps/web" ]]; then
  echo "[dev-start] ERROR: Could not reliably determine repository root." >&2
  echo "[dev-start] Expected to find apps/web in: $REPO_ROOT" >&2
  exit 1
fi

LOG_DIR="$REPO_ROOT/logs"
WEB_ENV="$REPO_ROOT/apps/web/.env.local"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.yml"

# Local DB defaults (matching infra/docker/docker-compose.yml)
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5433}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-nexus_db}"
LOCAL_DB_USER="${LOCAL_DB_USER:-nexus_user}"
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-nexus_password}"

mkdir -p "$LOG_DIR"

echo "[dev-start] Repo root: $REPO_ROOT (mode=local-docker)" | tee -a "$LOG_DIR/dev-start.log"

# --- Sanity checks ---------------------------------------------------------

if ! command -v npm >/dev/null 2>&1; then
  echo "[dev-start] ERROR: npm is not on PATH. Ensure Node/npm are installed." | tee -a "$LOG_DIR/dev-start.log" >&2
  exit 1
fi

# For local Docker dev, start-dev-clear-all.sh is responsible for bringing
# up Docker Desktop and docker-compose. Here we just fail fast if the
# expected local Postgres/Redis ports are not reachable, so you don't get
# mysterious 500s.

if command -v nc >/dev/null 2>&1; then
  echo "[dev-start] Checking local Postgres on 127.0.0.1:${LOCAL_DB_PORT}…" | tee -a "$LOG_DIR/dev-start.log"
  if ! nc -z 127.0.0.1 "${LOCAL_DB_PORT}" >/dev/null 2>&1; then
    echo "[dev-start] ERROR: No Postgres listening on 127.0.0.1:${LOCAL_DB_PORT}." | tee -a "$LOG_DIR/dev-start.log" >&2
    echo "[dev-start] Hint: run 'docker compose -f infra/docker/docker-compose.yml up -d' for local Docker dev." | tee -a "$LOG_DIR/dev-start.log" >&2
    exit 1
  fi

  echo "[dev-start] Checking local Redis on 127.0.0.1:6380…" | tee -a "$LOG_DIR/dev-start.log"
  if ! nc -z 127.0.0.1 6380 >/dev/null 2>&1; then
    echo "[dev-start] WARNING: No Redis listening on 127.0.0.1:6380; if REDIS_USE_REAL=true, auth/queues may fail." | tee -a "$LOG_DIR/dev-start.log" >&2
  fi
else
  echo "[dev-start] WARNING: 'nc' not found; skipping local Postgres/Redis port checks." | tee -a "$LOG_DIR/dev-start.log"
fi

# --- 1) Ensure web .env.local points to local API -------------------------

if [[ ! -f "$WEB_ENV" ]]; then
  cat > "$WEB_ENV" << 'EOF_WEB'
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF_WEB
  echo "[dev-start] Created apps/web/.env.local pointing to http://localhost:8000" | tee -a "$LOG_DIR/dev-start.log"
fi

# --- 2) Configure DATABASE_URL for local Postgres (or override externally) ---

# By default we point DATABASE_URL at the local Postgres instance that
# matches infra/docker/docker-compose.yml. If you are using Cloud SQL or
# another database, override DATABASE_URL before running this script.

# Also set a longer JWT access token TTL for dev so tokens last ~4 hours
# instead of the default 15 minutes. This is purely a convenience for
# local development; staging/prod should manage JWT_ACCESS_TTL via their
# own environment configuration.
export JWT_ACCESS_TTL="14400" # 4 hours

# --- If you want this script to be DB-agnostic, comment out the export
# below and rely entirely on your shell environment. ---

export DATABASE_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASSWORD}@127.0.0.1:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"
# Obfuscate password in log output
SANITIZED_DB_URL="${DATABASE_URL/${LOCAL_DB_PASSWORD}/****}"
echo "[dev-start] Using DATABASE_URL=${SANITIZED_DB_URL}" | tee -a "$LOG_DIR/dev-start.log"

# --- 3) Start API dev server ----------------------------------------------

export DATABASE_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASSWORD}@127.0.0.1:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"
# Obfuscate password in log output
SANITIZED_DB_URL="${DATABASE_URL/${LOCAL_DB_PASSWORD}/****}"
echo "[dev-start] Using local DATABASE_URL=${SANITIZED_DB_URL}" | tee -a "$LOG_DIR/dev-start.log"

# --- 4) Start API dev server ----------------------------------------------

if pgrep -f "apps/api.*ts-node-dev" >/dev/null 2>&1; then
  echo "[dev-start] API dev server already running" | tee -a "$LOG_DIR/dev-start.log"
else
  echo "[dev-start] Starting API dev server (local Docker Postgres) on API_PORT=8000..." | tee -a "$LOG_DIR/dev-start.log"
  (
    cd "$REPO_ROOT/apps/api"
    API_PORT=8000 nohup npm run dev \
      > "$LOG_DIR/api-dev.log" 2>&1 &
  )
  echo "[dev-start] Waiting 5 seconds for API dev to boot..." | tee -a "$LOG_DIR/dev-start.log"
  sleep 5
fi

# --- 5) Start API worker (BullMQ) ----------------------------------------

# Kill any stale/orphaned worker processes before starting a fresh one.
# Workers can become orphaned when terminals are closed or dev-start is
# re-run without proper cleanup. We want exactly ONE worker running.
if pgrep -f "ts-node.*src/worker.ts" >/dev/null 2>&1; then
  echo "[dev-start] Killing stale worker processes before starting fresh one..." | tee -a "$LOG_DIR/dev-start.log"
  pkill -f "ts-node.*src/worker.ts" || true
  sleep 1
fi

echo "[dev-start] Starting API worker (import jobs)..." | tee -a "$LOG_DIR/dev-start.log"
(
  cd "$REPO_ROOT/apps/api"
  nohup npm run worker:dev \
    > "$LOG_DIR/api-worker-dev.log" 2>&1 &
)

# --- 6) Start web dev server ---------------------------------------------

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

# --- 7) Health checks & summary -------------------------------------------

API_STATUS="FAILED"
WEB_STATUS="FAILED"
WORKER_STATUS="FAILED"

# API health (optional /health endpoint), with a short retry window so we
# don't mark it as FAILED just because Next/Nest are still warming up.
API_STATUS="FAILED (no response on :8000)"
for i in {1..10}; do
  if curl -sSf "http://localhost:8000/health" >/dev/null 2>&1; then
    API_STATUS="OK (health)"
    break
  elif curl -sSf "http://localhost:8000/" >/dev/null 2>&1; then
    API_STATUS="OK (root)"
    break
  fi
  sleep 2
done

# Web health with retry window as well.
WEB_STATUS="FAILED (no response on :3000)"
for i in {1..10}; do
  if curl -sSf "http://localhost:3000/" >/dev/null 2>&1; then
    WEB_STATUS="OK"
    break
  fi
  sleep 2
done

# Worker process
if pgrep -f "apps/api.*src/worker.ts" >/dev/null 2>&1; then
  WORKER_STATUS="OK (worker:dev)"
elif pgrep -f "dist/worker.js" >/dev/null 2>&1; then
  WORKER_STATUS="OK (dist/worker.js)"
else
  WORKER_STATUS="FAILED (no worker process found)"
fi

echo "[dev-start] Summary:" | tee -a "$LOG_DIR/dev-start.log"
echo "[dev-start]   API   : $API_STATUS" | tee -a "$LOG_DIR/dev-start.log"
echo "[dev-start]   Web   : $WEB_STATUS" | tee -a "$LOG_DIR/dev-start.log"
echo "[dev-start]   Worker: $WORKER_STATUS" | tee -a "$LOG_DIR/dev-start.log"

echo "[dev-start] Done (local Docker dev). Check $LOG_DIR for logs." | tee -a "$LOG_DIR/dev-start.log"
