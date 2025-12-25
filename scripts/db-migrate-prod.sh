#!/usr/bin/env bash
set -euo pipefail

# Run Prisma migrations against the production database.
#
# Usage (recommended):
#   export ProdDATABASE_URL="postgresql://postgres:<PROD_DB_PASSWORD>@34.27.95.130:5432/nexus_db"
#   export DATABASE_URL="$ProdDATABASE_URL"
#   ./scripts/db-migrate-prod.sh
#
# Notes:
# - Uses `prisma migrate deploy` (non-interactive, production-safe)
# - Never commits secrets; DATABASE_URL/ProdDATABASE_URL must be provided via environment variables

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Export it in your shell before running this script." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/packages/database"

echo "[db-migrate-prod] Running Prisma migrate deploy..."
# Use local Prisma from this workspace
npx prisma migrate deploy

echo "[db-migrate-prod] Done."