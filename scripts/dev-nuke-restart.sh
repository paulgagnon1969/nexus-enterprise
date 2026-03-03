#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# dev-nuke-restart.sh — Kill dev processes and restart the dev stack
#
# SAFE: This script NEVER touches the shadow/staging stack (nexus-shadow-*
# containers, Docker Desktop, or ports 8000/3001/5435/6381). It only manages:
#   - Host node processes (nodemon, ts-node, next dev) on ports 3000/8001
#   - Dev Docker containers (nexus-postgres, nexus-redis, nexus-postgres-shadow)
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

# ── 1) Kill host-side dev processes by name ─────────────────────────────────
#    These are node processes started by dev-start.sh or npm run dev:*.
#    We match by process name/args, NOT by port, to avoid collateral damage
#    to Docker proxy processes or shadow containers.

echo "→ Killing host dev processes..."

declare -a PATTERNS=(
  "nodemon.*apps/api"
  "ts-node.*src/main.ts"
  "ts-node.*src/worker.ts"
  "next dev.*apps/web"
  "next-router-worker"
)

KILLED=0
for PATTERN in "${PATTERNS[@]}"; do
  if pgrep -f "$PATTERN" >/dev/null 2>&1; then
    echo "  ✗ Killing: $PATTERN"
    pkill -9 -f "$PATTERN" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
done

if (( KILLED == 0 )); then
  echo "  ✓ No dev processes found"
else
  sleep 2
  echo "  ✓ Killed $KILLED process group(s)"
fi

# ── 2) Restart dev Docker containers (NOT shadow) ──────────────────────────
#    Use docker compose down/up on the dev compose file only. This restarts
#    nexus-postgres, nexus-redis, and nexus-postgres-shadow without affecting
#    any nexus-shadow-* containers.

echo ""
echo "→ Restarting dev Docker containers..."

if ! docker info >/dev/null 2>&1; then
  echo "  ⚠ Docker is not running. Shadow stack may also be down."
  echo "  Launching Docker Desktop..."
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
fi

if [[ -f "$COMPOSE_FILE" ]]; then
  docker compose -f "$COMPOSE_FILE" down 2>&1 | sed 's/^/  /'
  docker compose -f "$COMPOSE_FILE" up -d 2>&1 | sed 's/^/  /'
else
  echo "  ⚠ Compose file not found at $COMPOSE_FILE — skipping"
fi

# ── 3) Verify dev host ports are free ──────────────────────────────────────

echo ""
echo "→ Verifying dev host ports are free..."
DEV_HOST_PORTS=(3000 8001)
ALL_CLEAR=true
for PORT in "${DEV_HOST_PORTS[@]}"; do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ⚠ Port $PORT is still in use"
    ALL_CLEAR=false
  else
    echo "  ✓ Port $PORT is free"
  fi
done

if ! $ALL_CLEAR; then
  echo "  ⚠ Some dev ports still occupied — orphaned processes may need manual cleanup"
fi

# ── 4) Shadow stack health check ──────────────────────────────────────────

echo ""
echo "→ Shadow stack status:"
SHADOW_CONTAINERS=("nexus-shadow-api" "nexus-shadow-web" "nexus-shadow-tunnel" "nexus-shadow-postgres" "nexus-shadow-redis")
for C in "${SHADOW_CONTAINERS[@]}"; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$C" 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "running" ]]; then
    echo "  ✓ $C: running"
  else
    echo "  ⚠ $C: $STATUS"
  fi
done

# ── 5) Restart dev servers (unless --nuke) ─────────────────────────────────

if $NUKE_ONLY; then
  echo ""
  echo "══ Nuke complete (--nuke mode, no restart). ══"
  echo "   Run 'bash scripts/dev-start.sh' when ready."
  exit 0
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
