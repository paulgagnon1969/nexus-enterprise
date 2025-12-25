#!/usr/bin/env bash
set -e

# dev-clean: reset local dev processes for Nexus
# - Kills API, worker, and web dev processes
# - Kills any Cloud SQL proxies
# - Leaves local Redis (brew services) alone by default

echo "[dev-clean] Killing Nest dev servers and workers..."
pkill -f "ts-node src/main.ts" || true
pkill -f "ts-node src/worker.ts" || true
pkill -f "node dist/main.js" || true
pkill -f "node dist/worker.js" || true

echo "[dev-clean] Killing Cloud SQL proxy processes..."
pkill -f "cloud-sql-proxy" || true

echo "[dev-clean] Checking for listeners on ports 3000, 8000, 5434..."
PIDS="$(lsof -ti:3000 -ti:8000 -ti:5434 || true)"

if [ -n "$PIDS" ]; then
  echo "[dev-clean] Killing PIDs on 3000/8000/5434: $PIDS"
  kill $PIDS || true
else
  echo "[dev-clean] No listeners on 3000/8000/5434."
fi

# Ensure we have a sane PATH when run from launchd (no user shell)
# Include ServBay npm alias and Cloud SQL proxy path
export PATH="/Applications/ServBay/script/alias:/opt/homebrew/share/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "[dev-clean] Starting Cloud SQL proxy for nexusdev-v2 on 5434..."
nohup cloud-sql-proxy nexus-enterprise-480610:us-central1:nexusdev-v2 \
  --port=5434 --address=127.0.0.1 \
  > /Users/pg/Library/Logs/cloud-sql-nexusdev-v2.out 2>&1 &

echo "[dev-clean] Ensuring local Redis (brew services) is running..."
brew services start redis >/Users/pg/Library/Logs/redis-start.out 2>&1 || true

echo "[dev-clean] Starting API dev server (npm run dev:api)..."
cd /Users/pg/nexus-enterprise
nohup npm run dev:api > /Users/pg/Library/Logs/api-dev.out 2>&1 &

echo "[dev-clean] Starting worker dev server (npm run worker:dev)..."
cd /Users/pg/nexus-enterprise/apps/api
nohup npm run worker:dev > /Users/pg/Library/Logs/worker-dev.out 2>&1 &

echo "[dev-clean] Starting web dev server (npm run dev -- --filter=web)..."
cd /Users/pg/nexus-enterprise
nohup npm run dev -- --filter=web > /Users/pg/Library/Logs/web-dev.out 2>&1 &

echo "[dev-clean] All dev services started in background. Check logs in ~/Library/Logs/*.out if needed."
