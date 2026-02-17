#!/usr/bin/env bash
set -euo pipefail

# Run the local API (apps/api) dev server against Cloud SQL.
#
# Usage:
#   export DATABASE_URL="postgresql://postgres:<PASSWORD>@<CLOUD_SQL_IP>:5432/nexus_db"
#   ./scripts/dev-api-cloud-db.sh
#
# Note: DATABASE_URL is not stored in this repo; you must set it in your shell.

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Export it in your shell before running this script." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/apps/api"

echo "[dev-api-cloud-db] Using DATABASE_URL pointed at Cloud SQL (API_PORT=8001)."
API_PORT=8001 npm run dev
