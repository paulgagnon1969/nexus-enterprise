#!/usr/bin/env bash
# =============================================================================
# dev-api-service.sh — Managed dev API server for launchd
# =============================================================================
# Runs the NestJS dev API (via nodemon) as a persistent service.
# Managed by: ~/Library/LaunchAgents/com.nexus.dev-api.plist
#
# This script:
#   1. Waits for dev Postgres and Redis to be available
#   2. Runs nodemon in the foreground (launchd restarts on exit)
#   3. Logs to infra/logs/dev-api.log
# =============================================================================

REPO_ROOT="/Users/pg/nexus-enterprise"
API_DIR="${REPO_ROOT}/apps/api"
LOG_FILE="${REPO_ROOT}/infra/logs/dev-api.log"

mkdir -p "$(dirname "${LOG_FILE}")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${LOG_FILE}"
}

# ── Wait for dev infra ──────────────────────────────────────────────────────
wait_for_postgres() {
  local tries=0
  while ! pg_isready -h localhost -p 5433 -U nexus_user -q 2>/dev/null; do
    tries=$((tries + 1))
    if (( tries >= 30 )); then
      log "ERROR: Dev Postgres (localhost:5433) not ready after 30 attempts. Exiting."
      exit 1
    fi
    sleep 2
  done
  log "Dev Postgres ready"
}

wait_for_redis() {
  local tries=0
  while ! redis-cli -p 6380 ping 2>/dev/null | grep -q PONG; do
    tries=$((tries + 1))
    if (( tries >= 30 )); then
      log "ERROR: Dev Redis (localhost:6380) not ready after 30 attempts. Exiting."
      exit 1
    fi
    sleep 2
  done
  log "Dev Redis ready"
}

# ── Source dev env ──────────────────────────────────────────────────────────
if [[ -f "${API_DIR}/.env" ]]; then
  set -a
  source "${API_DIR}/.env"
  set +a
fi

# Override PORT for dev (prod uses 8000 inside Docker; dev uses 8001 on host)
export API_PORT="${API_PORT:-8001}"

# ── Wait for dependencies ──────────────────────────────────────────────────
log "Starting dev API service (port ${API_PORT})"
wait_for_postgres
wait_for_redis

# ── Run nodemon in foreground ──────────────────────────────────────────────
# launchd expects the process to stay in the foreground.
# KeepAlive in the plist restarts it if it exits.
log "Launching nodemon"
cd "${API_DIR}" || exit 1
exec node "${REPO_ROOT}/node_modules/.bin/nodemon" \
  --watch src \
  --ext ts \
  --exec "node ${REPO_ROOT}/node_modules/.bin/ts-node src/main.ts"
