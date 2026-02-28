#!/usr/bin/env bash
# =============================================================================
# Nexus Connect App (NCC) - Development Environment Launcher
# Starts: Laravel API (8001) + Next.js Web (3001) + Next.js Admin (3000)
# =============================================================================

set -euo pipefail

PROJECT_ROOT="/Users/pg/nexus-enterprise"
API_DIR="${PROJECT_ROOT}"
WEB_APP_DIR="${PROJECT_ROOT}/apps/web"
ADMIN_APP_DIR="${PROJECT_ROOT}/apps/admin"

API_PORT=8001
WEB_PORT=3001
ADMIN_PORT=3000

echo "=================================================="
echo "  Nexus Connect App (NCC) - Dev Environment Start"
echo "=================================================="

echo ""
echo "=== Killing existing processes on ports $ADMIN_PORT, $WEB_PORT, $API_PORT ==="
for port in $ADMIN_PORT $WEB_PORT $API_PORT; do
  pids="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port in use (PIDs: $pids) → killing..."
    kill $pids 2>/dev/null || true
    sleep 1
    remaining="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$remaining" ]; then
      echo "   Force killing $remaining"
      kill -9 $remaining 2>/dev/null || true
    fi
  else
    echo "Port $port is free"
  fi
done

echo ""
echo "=== Starting Laravel API on http://localhost:$API_PORT ==="
cd "$API_DIR"
php artisan serve --port=$API_PORT > "${PROJECT_ROOT}/storage/logs/api-dev.log" 2>&1 &
API_PID=$!
echo "Laravel API running (PID: $API_PID)"

echo ""
echo "=== Starting Next.js Web App on http://localhost:$WEB_PORT ==="
cd "$WEB_APP_DIR"
npm run dev -- -p $WEB_PORT > "${PROJECT_ROOT}/apps/web/.dev.log" 2>&1 &
WEB_PID=$!
echo "Web App running (PID: $WEB_PID)"

if [ -d "$ADMIN_APP_DIR" ]; then
  echo ""
  echo "=== Starting Next.js Admin Panel on http://localhost:$ADMIN_PORT ==="
  cd "$ADMIN_APP_DIR"
  npm run dev -- -p $ADMIN_PORT > "${PROJECT_ROOT}/apps/admin/.dev.log" 2>&1 &
  ADMIN_PID=$!
  echo "Admin Panel running (PID: $ADMIN_PID)"
else
  echo "Admin directory not found – skipping"
  ADMIN_PID=""
fi

echo ""
echo "=================================================="
echo "          ALL NEXUS CONNECT SERVERS ARE UP!          "
echo "=================================================="
echo "   API         → http://localhost:$API_PORT   (PID $API_PID)"
echo "   Web App     → http://localhost:$WEB_PORT   (PID $WEB_PID)"
[ -n "$ADMIN_PID" ] && echo "   Admin       → http://localhost:$ADMIN_PORT (PID $ADMIN_PID)"
echo ""
echo "   To stop: kill $API_PID $WEB_PID ${ADMIN_PID:-}"
echo "=================================================="

wait
