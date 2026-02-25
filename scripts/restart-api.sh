#!/usr/bin/env bash
# restart-api.sh - Start (or restart) the API dev server as a detached process.
# Safe to call from Warp agent sessions: the process survives session end.
# Logs are written to /tmp/nexus-api-dev.log for inspection.

set -euo pipefail

PORT=8001
LOG="/tmp/nexus-api-dev.log"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Check if something is already listening on the port
if lsof -i:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "API dev server already running on port ${PORT} - nothing to do."
  exit 0
fi

echo "Starting API dev server (detached) on port ${PORT}..."
echo "  Logs: ${LOG}"

# Start detached: nohup + disown so it outlives the calling shell/session
cd "${ROOT}"
nohup npm run dev:api > "${LOG}" 2>&1 &
DEV_PID=$!
disown "${DEV_PID}"

# Wait a few seconds and confirm it came up
sleep 4

if lsof -i:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "API dev server is up (PID ${DEV_PID}, port ${PORT})."
else
  echo "Server may still be starting - check logs: tail -f ${LOG}"
fi
