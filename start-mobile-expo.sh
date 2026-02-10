#!/usr/bin/env bash
set -euo pipefail

# Free up Expo dev port (8081) before starting
if command -v lsof >/dev/null 2>&1; then
  echo "[nexus-mobile] Killing any process on port 8081…"
  lsof -ti:8081 | xargs kill 2>/dev/null || true
fi

# Directory of the mobile app
cd "$HOME/nexus-enterprise/apps/mobile"

########################################
# Choose which API to hit by default
########################################

# Option A: Production API
API_BASE_DEFAULT="https://nexus-api-979156454944.us-central1.run.app"

# Option B: Local API (uncomment and set your Mac IP if you prefer local backend)
# API_BASE_DEFAULT="http://192.168.1.27:8001"

# Allow override via environment, but default to API_BASE_DEFAULT
API_BASE="${EXPO_PUBLIC_API_BASE_URL:-$API_BASE_DEFAULT}"

echo "[nexus-mobile] Starting Expo dev server"
echo "  API base: $API_BASE"
echo "  App dir:  $PWD"
echo

# Start Expo with the chosen API base URL
EXPO_PUBLIC_API_BASE_URL="$API_BASE" npm run web
