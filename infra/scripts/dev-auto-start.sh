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

# ── 3. Run dev-start.sh (API, worker, web) ─────────────────
log "Running dev-start.sh..."
bash "$REPO_ROOT/scripts/dev-start.sh" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  log "Dev stack started successfully."
else
  log "WARNING: dev-start.sh exited with code $EXIT_CODE. Check logs."
fi

log "=== Dev auto-start complete ==="
