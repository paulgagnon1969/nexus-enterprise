#!/usr/bin/env bash
set -euo pipefail

# Simple dev startup script for Nexus Enterprise
# - Starts Docker infra (Postgres + Redis)
# - Starts API dev server
# - Starts Web dev server

REPO_ROOT="/Users/pg/nexus-enterprise"
cd "$REPO_ROOT"

# Ensure a reasonable PATH when run from launchd (which has a very minimal env)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Kill any existing dev servers holding ports 8000 (API) or 3000 (web)
for port in 8000 3000; do
  PIDS=$(lsof -ti :"$port" || true)
  if [ -n "$PIDS" ]; then
    echo "[startup] Killing old dev processes on port $port: $PIDS"
    kill $PIDS || true
  fi
done

# Load env vars
if [ -f "$REPO_ROOT/.env" ]; then
  echo "[startup] Loading env from $REPO_ROOT/.env"
  # Safely export vars from .env (ignore blank lines and comments)
  # This will work for simple KEY=VALUE lines used in this project.
  set -a
  # shellcheck disable=SC1090
  . "$REPO_ROOT/.env"
  set +a
fi

# 1) Start Docker infra (Postgres, Redis) in the background
if [ -f "$REPO_ROOT/docker-compose.yml" ] || [ -f "$REPO_ROOT/docker-compose.yaml" ]; then
  echo "[startup] Bringing up Docker services (postgres, redis)..."
  docker compose up -d postgres redis || docker-compose up -d postgres redis || true
else
  echo "[startup] No docker-compose.yml found, skipping Docker infra startup"
fi

# 2) Start API dev server
cd "$REPO_ROOT/apps/api"

echo "[startup] Starting API dev server..."
# Background API dev server and log output
/usr/local/bin/npm run dev >> "$HOME/Library/Logs/nexus-api-dev.log" 2>&1 &
API_PID=$!

# 3) Start Web dev server
cd "$REPO_ROOT/apps/web"

echo "[startup] Starting Web dev server..."
/usr/local/bin/npm run dev >> "$HOME/Library/Logs/nexus-web-dev.log" 2>&1 &
WEB_PID=$!

cd "$REPO_ROOT"

echo "[startup] API PID: $API_PID, Web PID: $WEB_PID"
echo "[startup] Nexus Enterprise dev stack started."

exit 0
