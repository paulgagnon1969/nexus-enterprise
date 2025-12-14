#!/usr/bin/env bash
set -euo pipefail

# Clean dev shutdown script for Nexus Enterprise
# - Stops Cloud SQL Auth Proxy on port 5433
# - Stops API dev server started via scripts/dev-api-cloud-db.sh
# - Stops Next.js web dev server on port 3000

REPO_ROOT="/Users/pg/nexus-enterprise"
LOG_DIR="$REPO_ROOT/logs"

mkdir -p "$LOG_DIR"

log() {
  echo "[dev-stop] $1" | tee -a "$LOG_DIR/dev-stop.log"
}

# 1) Stop Cloud SQL proxy
if pgrep -f "cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexus-prod-postgres" >/dev/null 2>&1; then
  log "Stopping Cloud SQL proxy on 127.0.0.1:5433"
  pkill -f "cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexus-prod-postgres" || true
else
  log "Cloud SQL proxy not running"
fi

# 2) Stop API dev server (scripts/dev-api-cloud-db.sh)
if pgrep -f "scripts/dev-api-cloud-db.sh" >/dev/null 2>&1; then
  log "Stopping API dev server (scripts/dev-api-cloud-db.sh)"
  pkill -f "scripts/dev-api-cloud-db.sh" || true
else
  log "API dev server not running"
fi

# 3) Stop web dev server (next dev -p 3000)
if pgrep -f "next dev -p 3000" >/dev/null 2>&1; then
  log "Stopping web dev server (next dev -p 3000)"
  pkill -f "next dev -p 3000" || true
else
  log "Web dev server not running"
fi

log "Done. Checked and stopped dev processes as needed."