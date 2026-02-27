#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# dev-healthcheck.sh — Dev stack monitor / listening post
#
# Polls every 5 seconds and prints a one-line status for each
# component. Run this in a dedicated terminal while testing
# deploys, Vercel pushes, etc. to catch exactly when and what
# breaks.
#
# Usage:
#   bash scripts/dev-healthcheck.sh
#   bash scripts/dev-healthcheck.sh --interval 2   # poll every 2s
# ─────────────────────────────────────────────────────────────

INTERVAL="${1:-5}"
if [[ "$1" == "--interval" ]]; then
  INTERVAL="${2:-5}"
fi

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

ok()   { printf "${GREEN}✓${RESET}"; }
fail() { printf "${RED}✗${RESET}"; }
warn() { printf "${YELLOW}~${RESET}"; }

check_port() {
  lsof -i:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

echo "═══════════════════════════════════════════════════════════"
echo " Nexus Dev Stack Monitor — polling every ${INTERVAL}s"
echo " Press Ctrl+C to stop"
echo "═══════════════════════════════════════════════════════════"
echo ""
printf "%-20s  %-8s %-8s %-8s %-8s %-8s %-10s\n" \
  "TIMESTAMP" "DOCKER" "PG:5433" "RD:6380" "API:8001" "WEB:3000" "API/health"
printf "%-20s  %-8s %-8s %-8s %-8s %-8s %-10s\n" \
  "───────────────────" "──────" "──────" "──────" "───────" "───────" "─────────"

PREV_STATUS=""

while true; do
  TS="$(date '+%H:%M:%S')"

  # 1. Docker Desktop
  if docker info >/dev/null 2>&1; then
    DOCKER_STATUS="$(ok) up"
  else
    DOCKER_STATUS="$(fail) DOWN"
  fi

  # 2. Postgres (Docker container port-forward)
  if check_port 5433; then
    PG_STATUS="$(ok) up"
  else
    PG_STATUS="$(fail) DOWN"
  fi

  # 3. Redis
  if check_port 6380; then
    RD_STATUS="$(ok) up"
  else
    RD_STATUS="$(fail) DOWN"
  fi

  # 4. API process on port 8001
  if check_port 8001; then
    API_PROC="$(ok) up"
  else
    API_PROC="$(fail) DOWN"
  fi

  # 5. Web process on port 3000
  if check_port 3000; then
    WEB_STATUS="$(ok) up"
  else
    WEB_STATUS="$(fail) DOWN"
  fi

  # 6. API health endpoint (only if port is up)
  if check_port 8001; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:8001/health 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      HEALTH_STATUS="$(ok) ${HTTP_CODE}"
    elif [[ "$HTTP_CODE" == "000" ]]; then
      HEALTH_STATUS="$(warn) timeout"
    else
      HEALTH_STATUS="$(warn) ${HTTP_CODE}"
    fi
  else
    HEALTH_STATUS="$(fail) --"
  fi

  CURRENT_STATUS="${DOCKER_STATUS}|${PG_STATUS}|${RD_STATUS}|${API_PROC}|${WEB_STATUS}|${HEALTH_STATUS}"

  # Always print, but add a separator line if status changed
  if [[ -n "$PREV_STATUS" && "$CURRENT_STATUS" != "$PREV_STATUS" ]]; then
    echo "  ── STATUS CHANGE DETECTED ──────────────────────────────"
  fi

  printf "%-20s  %-8b %-8b %-8b %-8b %-8b %-10b\n" \
    "$TS" "$DOCKER_STATUS" "$PG_STATUS" "$RD_STATUS" "$API_PROC" "$WEB_STATUS" "$HEALTH_STATUS"

  PREV_STATUS="$CURRENT_STATUS"
  sleep "$INTERVAL"
done
