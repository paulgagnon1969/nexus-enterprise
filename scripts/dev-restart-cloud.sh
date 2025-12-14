#!/usr/bin/env bash
set -euo pipefail

# Restart local dev stack using Cloud SQL as the database.
#
# This script:
#   1) Kills any dev servers on ports 3000 and 8000
#   2) Starts the API dev server using DATABASE_URL (Cloud SQL)
#   3) Starts the web dev server (Next.js) on port 3000
#
# Prereqs:
#   - DATABASE_URL must already be exported in your shell, e.g.
#       export DATABASE_URL="postgresql://postgres:<PASSWORD>@<CLOUD_SQL_IP>:5432/nexus_db"
#   - Node dependencies installed (npm ci / npm install already run)

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[dev-restart-cloud] DATABASE_URL is not set. Export it in your shell before running this script." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[dev-restart-cloud] Cleaning dev ports (3000, 8000)..."
./scripts/dev-clean.sh || true

echo "[dev-restart-cloud] Starting API dev server against Cloud SQL (port 8000)..."
(
  cd "$ROOT_DIR"
  ./scripts/dev-api-cloud-db.sh
) &
API_PID=$!

echo "[dev-restart-cloud] Starting web dev server (port 3000)..."
(
  cd "$ROOT_DIR/apps/web"
  npm run dev
) &
WEB_PID=$!

echo "[dev-restart-cloud] API PID: $API_PID, Web PID: $WEB_PID"
echo "[dev-restart-cloud] Local dev stack started using Cloud SQL."
echo "[dev-restart-cloud] Use 'kill $API_PID $WEB_PID' to stop both from this shell if needed."
