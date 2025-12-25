#!/usr/bin/env zsh

set -euo pipefail

REPO_DIR="$HOME/nexus-enterprise"
COMPOSE_FILE="$REPO_DIR/infra/docker/docker-compose.yml"

echo "=== HARD RESET: killing dev processes and restarting Nexus dev (Cloud SQL nexusdev-v2) ==="

echo "→ Killing anything on ports 3000, 8000, 5432, 6380…"
for PORT in 3000 8000 5432 6380; do
  if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "  - Port $PORT in use, killing processes..."
    lsof -iTCP:$PORT -sTCP:LISTEN -t | xargs kill -9 || true
  else
    echo "  - Port $PORT is free."
  fi
done

echo "→ Killing common Node dev processes (node/next/nodemon/ts-node-dev)…"
pkill -f "next dev" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "node .*apps/api" 2>/dev/null || true
pkill -f "node .*apps/web" 2>/dev/null || true

echo "→ Changing to repo: $REPO_DIR"
cd "$REPO_DIR"

echo "→ Stopping Docker infra (if running)…"
if [ -f "$COMPOSE_FILE" ]; then
  docker compose -f "$COMPOSE_FILE" down || true
else
  echo "  ⚠️ Compose file not found at $COMPOSE_FILE"
fi

echo "→ Delegating dev startup to scripts/dev-start.sh (Cloud SQL on 5434)…"
if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
  echo "  ⚠️ DEV_DB_PASSWORD is not set. Export it before running start-dev.sh (e.g. export DEV_DB_PASSWORD=Nexusdevpass.22)." >&2
  exit 1
fi

bash "$REPO_DIR/scripts/dev-start.sh"

echo "=== Dev environment started via scripts/dev-start.sh (API :8000, Web :3000, DB nexusdev-v2 on :5434) ==="
