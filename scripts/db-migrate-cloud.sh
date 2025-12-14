#!/usr/bin/env bash
set -euo pipefail

# Run Prisma migrations (packages/database) against Cloud SQL.
#
# Usage:
#   export DATABASE_URL="postgresql://postgres:<PASSWORD>@<CLOUD_SQL_IP>:5432/nexus_db"
#   ./scripts/db-migrate-cloud.sh
#
# Note: DATABASE_URL is not stored in this repo; you must set it in your shell.

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Export it in your shell before running this script." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/packages/database"

echo "[db-migrate-cloud] Running Prisma migrations against Cloud SQL..."
npm run prisma:migrate
