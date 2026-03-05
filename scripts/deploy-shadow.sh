#!/usr/bin/env bash
# deploy-shadow.sh — Deploy services to the local shadow/production stack.
#
# Usage:
#   bash scripts/deploy-shadow.sh              # Deploy API + Worker (default)
#   bash scripts/deploy-shadow.sh api worker   # Deploy API + Worker (explicit)
#   bash scripts/deploy-shadow.sh web          # Deploy Web only
#   bash scripts/deploy-shadow.sh all          # Deploy everything
#
# This script handles:
#   1. Loading .env.shadow for variable interpolation
#   2. Building the specified service images (--no-cache)
#   3. Restarting containers on the correct network
#   4. Running pending Prisma migrations
#   5. Health check verification
#
# IMPORTANT: This replaces manual docker compose commands. Always use this
# script (or `npm run deploy:shadow`) instead of raw docker compose for
# shadow stack deploys.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.shadow.yml"
ENV_FILE="$REPO_ROOT/.env.shadow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ── Preflight checks ──────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  err ".env.shadow not found at $ENV_FILE"
  err "This file contains production secrets and is required for deployment."
  exit 1
fi

if ! docker info &>/dev/null; then
  err "Docker is not running. Start Docker Desktop first."
  exit 1
fi

# ── Parse arguments ───────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  SERVICES=(api worker)
else
  SERVICES=("$@")
fi
if [ "${SERVICES[0]}" = "all" ]; then
  SERVICES=(api worker web receipt-poller)
fi

log "Deploying services: ${SERVICES[*]}"
log "Compose file: $COMPOSE_FILE"
echo ""

# ── Helper: compose command with env file ─────────────────────────────
# The compose file has `name: nexus-shadow` baked in, so no -p flag needed.
# We still pass --env-file so ${SHADOW_PG_PASSWORD} etc. interpolate correctly
# in the compose file's `environment:` blocks.
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# ── Build ─────────────────────────────────────────────────────────────

log "Building images..."
compose build --no-cache "${SERVICES[@]}"
echo ""

# ── Stop old containers ───────────────────────────────────────────────

log "Removing old containers..."
for svc in "${SERVICES[@]}"; do
  CONTAINER="nexus-shadow-${svc}"
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker rm -f "$CONTAINER" 2>/dev/null || true
  fi
done

# ── Start new containers ─────────────────────────────────────────────
# Use --no-deps so we don't try to recreate data stores (postgres, redis,
# minio) which are long-lived and may have been started independently.

log "Starting containers..."
compose up -d --no-deps "${SERVICES[@]}"
echo ""

# ── Wait for health ──────────────────────────────────────────────────

log "Waiting for containers to become healthy..."
MAX_WAIT=60
ELAPSED=0
ALL_HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  ALL_HEALTHY=true

  for svc in "${SERVICES[@]}"; do
    CONTAINER="nexus-shadow-${svc}"
    # receipt-poller has no healthcheck
    if [ "$svc" = "receipt-poller" ]; then
      continue
    fi
    STATUS=$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
    if [ "$STATUS" != "healthy" ]; then
      ALL_HEALTHY=false
      printf "  %-30s %s (%ds)\n" "$CONTAINER" "$STATUS" "$ELAPSED"
    fi
  done

  if $ALL_HEALTHY; then
    break
  fi
done

echo ""
if $ALL_HEALTHY; then
  log "All containers healthy ✅"
else
  warn "Some containers not healthy after ${MAX_WAIT}s — check logs"
  for svc in "${SERVICES[@]}"; do
    CONTAINER="nexus-shadow-${svc}"
    STATUS=$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
    printf "  %-30s %s\n" "$CONTAINER" "$STATUS"
  done
fi

# ── Run pending Prisma migrations ─────────────────────────────────────
# Only run if API was deployed (schema changes accompany API deploys).

if printf '%s\n' "${SERVICES[@]}" | grep -q "^api$"; then
  log "Checking for pending Prisma migrations..."
  set -a; source "$ENV_FILE"; set +a
  DATABASE_URL="postgresql://${SHADOW_PG_USER:-nexus_user}:${SHADOW_PG_PASSWORD}@localhost:5435/${SHADOW_PG_DB:-NEXUSPRODv3}" \
    npx prisma migrate deploy --config "$REPO_ROOT/packages/database/prisma.config.ts" 2>&1 \
    | grep -E "applied|already|migrations found" || true
  echo ""
fi

# ── Verify external access ───────────────────────────────────────────

if printf '%s\n' "${SERVICES[@]}" | grep -q "^api$"; then
  log "Verifying API health..."
  API_HEALTH=$(curl -s --max-time 5 https://staging-api.nfsgrp.com/health 2>/dev/null || echo "unreachable")
  if echo "$API_HEALTH" | grep -q '"ok":true'; then
    log "staging-api.nfsgrp.com → $API_HEALTH ✅"
  else
    warn "staging-api.nfsgrp.com → $API_HEALTH ⚠️"
    warn "Tunnel may need a moment to pick up the new container."
  fi
fi

if printf '%s\n' "${SERVICES[@]}" | grep -q "^web$"; then
  log "Verifying Web health..."
  WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://staging-ncc.nfsgrp.com 2>/dev/null || echo "000")
  if [ "$WEB_STATUS" = "200" ]; then
    log "staging-ncc.nfsgrp.com → HTTP $WEB_STATUS ✅"
  else
    warn "staging-ncc.nfsgrp.com → HTTP $WEB_STATUS ⚠️"
  fi
fi

echo ""
log "Deploy complete."
docker ps --filter "name=nexus-shadow" --format "table {{.Names}}\t{{.Status}}" | sort
