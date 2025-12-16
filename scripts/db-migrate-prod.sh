#!/usr/bin/env bash
set -euo pipefail

# Run Prisma migrations against a production database.
#
# Usage:
#   export DATABASE_URL="postgresql://postgres:${PROD_DB_PASSWORD}@34.29.118.171:5432/nexus_db"
#   ./scripts/db-migrate-prod.sh
#
# Notes:
# - Uses `prisma migrate deploy` (non-interactive, production-safe)
# - Never commits secrets; DATABASE_URL must be provided via environment variable

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