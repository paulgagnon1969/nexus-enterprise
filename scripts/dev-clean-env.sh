#!/usr/bin/env bash
set -euo pipefail

# Clean Nexus dev environment and start a fresh local dev stack.
# - Kills local dev servers and proxies (API, worker, web, Cloud SQL proxy)
# - Verifies key ports are free
# - Runs scripts/dev-start.sh to bring everything back up

REPO_ROOT="/Users/pg/nexus-enterprise"
LOG_DIR="$REPO_ROOT/logs"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-clean-env.log"

log() {
  echo "[dev-clean-env] $1" | tee -a "$LOG_FILE"
}

log "Starting clean dev environment sequence..."

# 1) Kill Cloud SQL proxies (dev or prod) to free port 5433
if pgrep -f "cloud-sql-proxy" >/dev/null 2>&1; then
  log "Killing cloud-sql-proxy processes..."
  pkill -f "cloud-sql-proxy" || true
else
  log "No cloud-sql-proxy processes found."
fi

# 2) Kill API dev server (ts-node-dev via dev-api-cloud-db.sh)
if pgrep -f "scripts/dev-api-cloud-db.sh" >/dev/null 2>&1; then
  log "Killing dev-api-cloud-db script..."
  pkill -f "scripts/dev-api-cloud-db.sh" || true
fi

if pgrep -f "ts-node-dev --respawn --transpile-only src/main.ts" >/dev/null 2>&1; then
  log "Killing API ts-node-dev main server..."
  pkill -f "ts-node-dev --respawn --transpile-only src/main.ts" || true
fi

# 3) Kill API worker dev process
if pgrep -f "src/worker.ts" >/dev/null 2>&1; then
  log "Killing API worker dev process (src/worker.ts)..."
  pkill -f "src/worker.ts" || true
fi

# 4) Kill web dev server (Next.js)
if pgrep -f "next dev -p 3000" >/dev/null 2>&1; then
  log "Killing web dev server (next dev -p 3000)..."
  pkill -f "next dev -p 3000" || true
else
  log "No Next.js dev server found."
fi

log "Waiting 2 seconds for processes to terminate..."
sleep 2

# 5) Verify key ports are free
log "Verifying ports 3000 (web), 8001 (API dev), 5433 (Cloud SQL proxy) are free..."
if lsof -iTCP:3000 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  log "WARNING: Something is still listening on port 3000."
else
  log "Port 3000 is free."
fi

if lsof -iTCP:8001 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  log "WARNING: Something is still listening on port 8001 (dev API)."
else
  log "Port 8001 is free."
fi

if lsof -iTCP:5433 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  log "WARNING: Something is still listening on port 5433."
else
  log "Port 5433 is free."
fi

# 6) Start fresh dev stack
log "Starting fresh dev stack via scripts/dev-start.sh..."
cd "$REPO_ROOT"

bash ./scripts/dev-start.sh

log "Done. Dev environment is up. Check $LOG_DIR for logs."
