#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# dev-nuke-restart.sh — Kill ALL Nexus dev processes and restart from scratch
#
# USE THIS when ports are stale, processes are orphaned, or you just want a
# guaranteed clean dev environment. Safe to run at any time.
#
# Usage:
#   bash scripts/dev-nuke-restart.sh           # nuke + restart
#   bash scripts/dev-nuke-restart.sh --nuke    # nuke only (no restart)
# ============================================================================

NUKE_ONLY=false
if [[ "${1:-}" == "--nuke" ]]; then
  NUKE_ONLY=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.yml"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       NEXUS DEV STACK — NUKE & RESTART           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1) Kill processes on dev ports ──────────────────────────────────────────

PORTS=(3000 8001 5433 5434 6380)
echo "→ Checking dev ports: ${PORTS[*]}"
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "  ✗ Port $PORT in use (PIDs: $PIDS) — killing..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  else
    echo "  ✓ Port $PORT is free"
  fi
done

# ── 2) Kill known dev processes by name ─────────────────────────────────────

echo ""
echo "→ Killing known dev processes..."

declare -a PATTERNS=(
  "nodemon.*apps/api"
  "ts-node.*src/main.ts"
  "ts-node.*src/worker.ts"
  "next dev"
  "node.*apps/api"
  "node.*apps/web"
  "cloud-sql-proxy"
)

for PATTERN in "${PATTERNS[@]}"; do
  if pgrep -f "$PATTERN" >/dev/null 2>&1; then
    echo "  ✗ Killing: $PATTERN"
    pkill -9 -f "$PATTERN" 2>/dev/null || true
  fi
done

sleep 2
echo "  ✓ All dev processes killed"

# ── 3) Verify ports are free ───────────────────────────────────────────────

echo ""
echo "→ Verifying all ports are free..."
ALL_CLEAR=true
for PORT in "${PORTS[@]}"; do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ⚠ Port $PORT is STILL in use"
    ALL_CLEAR=false
  fi
done

if $ALL_CLEAR; then
  echo "  ✓ All ports clear"
else
  echo "  ⚠ Some ports still occupied — you may need to investigate manually"
fi

# ── 4) Restart (unless --nuke) ─────────────────────────────────────────────

if $NUKE_ONLY; then
  echo ""
  echo "══ Nuke complete (--nuke mode, no restart). ══"
  echo "   Run 'bash scripts/dev-start.sh' when ready."
  exit 0
fi

echo ""
echo "→ Ensuring Docker is running..."
if ! docker info >/dev/null 2>&1; then
  echo "  Docker not running — launching Docker Desktop..."
  open -a Docker
  echo "  Waiting for Docker daemon (max 120s)..."
  WAITED=0
  until docker info >/dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if (( WAITED >= 120 )); then
      echo "  ✗ Docker did not start within 120s. Aborting." >&2
      exit 1
    fi
  done
  echo "  ✓ Docker is ready"
else
  echo "  ✓ Docker already running"
fi

echo ""
echo "→ Starting Docker infra (Postgres + Redis)..."
if [[ -f "$COMPOSE_FILE" ]]; then
  docker compose -f "$COMPOSE_FILE" up -d
else
  echo "  ⚠ Compose file not found at $COMPOSE_FILE — skipping"
fi

echo ""
echo "→ Handing off to scripts/dev-start.sh..."
echo ""
bash "$REPO_ROOT/scripts/dev-start.sh"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       DEV STACK NUKED & RESTARTED ✓              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
