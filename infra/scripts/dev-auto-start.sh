#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Dev Auto-Start — launched by launchd on login
#
# 1. Waits for Docker Desktop to be ready (up to 120s)
# 2. Starts dev Docker infra (Postgres + Redis)
# 3. Runs dev-start.sh (API, worker, web)
#
# This script is idempotent — dev-start.sh skips processes
# that are already running.
# ─────────────────────────────────────────────────────────────

REPO_ROOT="/Users/pg/nexus-enterprise"
LOG_DIR="$REPO_ROOT/infra/logs"
LOG_FILE="$LOG_DIR/dev-auto-start.log"

# Ensure nvm-managed node is on PATH (launchd doesn't load .zshrc)
export PATH="/Users/pg/.nvm/versions/node/v24.12.0/bin:$PATH"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.yml"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Dev auto-start triggered ==="

# ── 1. Wait for Docker Desktop ─────────────────────────────
MAX_WAIT=120
WAITED=0

log "Waiting for Docker Desktop..."
while ! docker info >/dev/null 2>&1; do
  if (( WAITED >= MAX_WAIT )); then
    log "ERROR: Docker Desktop not ready after ${MAX_WAIT}s. Aborting."
    exit 1
  fi
  sleep 5
  WAITED=$((WAITED + 5))
done
log "Docker Desktop ready (waited ${WAITED}s)."

# ── 2. Start dev Docker infra (Postgres + Redis) ───────────
log "Starting dev Docker containers..."
docker compose -f "$COMPOSE_FILE" up -d >> "$LOG_FILE" 2>&1

# Wait for Postgres to accept connections
log "Waiting for dev Postgres on :5433..."
for i in {1..30}; do
  if nc -z localhost 5433 >/dev/null 2>&1; then
    log "Dev Postgres ready."
    break
  fi
  sleep 2
done

# ── 3. Start dev processes (detached from launchd process tree) ─
# launchd kills all child processes when the job script exits.
# We use `launchctl submit` to spawn each process as its own
# independent launchd job so they survive after this script ends.

DEV_LOG="$REPO_ROOT/logs"
mkdir -p "$DEV_LOG"

# Regenerate Prisma client first
log "Regenerating Prisma client..."
(cd "$REPO_ROOT/packages/database" && npx prisma generate >> "$LOG_FILE" 2>&1)
log "Prisma client generated."

# Ensure .env.local exists for web
WEB_ENV="$REPO_ROOT/apps/web/.env.local"
if [[ ! -f "$WEB_ENV" ]]; then
  echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8001' > "$WEB_ENV"
  log "Created apps/web/.env.local"
fi

export DATABASE_URL="postgresql://nexus_user:nexus_password@localhost:5433/NEXUSDEVv3"
export API_PORT=8001
export JWT_ACCESS_TTL=14400

# API dev server
if ! lsof -i:8001 >/dev/null 2>&1; then
  log "Starting API dev server..."
  cd "$REPO_ROOT/apps/api" && nohup npm run dev > "$DEV_LOG/api-dev.log" 2>&1 &
  disown
  cd "$REPO_ROOT"
else
  log "API already running on :8001"
fi

# Worker
if ! pgrep -f "ts-node.*src/worker.ts" >/dev/null 2>&1; then
  log "Starting worker..."
  cd "$REPO_ROOT/apps/api" && nohup npm run worker:dev > "$DEV_LOG/api-worker-dev.log" 2>&1 &
  disown
  cd "$REPO_ROOT"
else
  log "Worker already running"
fi

# Web dev server
if ! lsof -i:3000 >/dev/null 2>&1; then
  log "Starting web dev server..."
  cd "$REPO_ROOT/apps/web" && nohup npm run dev > "$DEV_LOG/web-dev.log" 2>&1 &
  disown
  cd "$REPO_ROOT"
else
  log "Web already running on :3000"
fi

# Wait for health
log "Waiting for API health..."
for i in {1..20}; do
  if curl -sf http://localhost:8001/health >/dev/null 2>&1; then
    log "API healthy."
    break
  fi
  sleep 3
done

log "Waiting for Web..."
for i in {1..20}; do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    log "Web healthy."
    break
  fi
  sleep 3
done

log "=== Dev auto-start complete ==="
