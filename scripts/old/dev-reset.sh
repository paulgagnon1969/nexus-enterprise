#!/usr/bin/env bash
set -euo pipefail

echo "=== Killing dev servers on 3000, 3001, 8000 ==="
for port in 3000 3001 8000; do
  pids="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port in use by: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    # Force kill if still there
    pids2="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids2" ]; then
      echo "Force killing $pids2 on port $port"
      kill -9 $pids2 2>/dev/null || true
    fi
  else
    echo "no_listener_on_$port"
  fi
done

echo "=== Starting API dev server (8000) ==="
cd /Users/pg/nexus-enterprise
npm run dev:api &
API_PID=$!
echo "API PID: $API_PID"

echo "=== Starting web dev server (3001) ==="
cd /Users/pg/nexus-enterprise/apps/web
npm run dev &
WEB_PID=$!
echo "Web PID: $WEB_PID"

echo
echo "API listening on 8000 (PID $API_PID), web on 3001 (PID $WEB_PID)."
echo "Use 'kill $API_PID $WEB_PID' if you need to stop them from this shell."
wait