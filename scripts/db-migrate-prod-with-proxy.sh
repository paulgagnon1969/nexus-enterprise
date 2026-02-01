#!/usr/bin/env bash
set -euo pipefail

# Run Prisma migrations against the **prod** Cloud SQL database, end-to-end:
# - Starts Cloud SQL Proxy on localhost:5433
# - Exports DATABASE_URL if needed
# - Runs `prisma migrate deploy`
# - Shuts down the proxy
#
# USAGE (recommended):
#   cd ~/nexus-enterprise
#   ./scripts/db-migrate-prod-with-proxy.sh
#
# Or, if you already have DATABASE_URL pointing at 127.0.0.1:5433:
#   cd ~/nexus-enterprise
#   export DATABASE_URL="postgresql://postgres:Nexusprodpass.22@127.0.0.1:5433/nexus_db"
#   ./scripts/db-migrate-prod-with-proxy.sh
#
# REQUIREMENTS:
#   - `cloud-sql-proxy` installed and on your PATH
#   - gcloud authenticated to the project that owns the instance

INSTANCE="nexus-enterprise-480610:us-central1:nexusprod-v2"
LOCAL_PORT="5433"
DB_USER="postgres"
DB_NAME="nexus_db"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[db-migrate-prod-with-proxy] Preflight: checking GCP Application Default Credentials..."
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "[db-migrate-prod-with-proxy] ERROR: Application Default Credentials are invalid or missing." >&2
  echo "[db-migrate-prod-with-proxy] Run: gcloud auth application-default login" >&2
  exit 1
fi

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "[db-migrate-prod-with-proxy] ERROR: cloud-sql-proxy is not installed or not on your PATH." >&2
  echo "Install it from: https://cloud.google.com/sql/docs/postgres/sql-proxy" >&2
  exit 1
fi

echo "[db-migrate-prod-with-proxy] Preflight: ensuring port $LOCAL_PORT is free..."
# Find any PIDs currently listening on the port and kill them (dev convenience).
EXISTING_PIDS=$(lsof -ti tcp:"$LOCAL_PORT" || true)
if [[ -n "$EXISTING_PIDS" ]]; then
  echo "[db-migrate-prod-with-proxy] Killing existing processes on port $LOCAL_PORT: $EXISTING_PIDS"
  # shellcheck disable=SC2086
  kill $EXISTING_PIDS || true
  sleep 1
fi

# Start Cloud SQL Proxy in the background
echo "[db-migrate-prod-with-proxy] Starting Cloud SQL Proxy for $INSTANCE on port $LOCAL_PORT..."
cloud-sql-proxy --port="$LOCAL_PORT" "$INSTANCE" >/tmp/cloud-sql-proxy.log 2>&1 &
PROXY_PID=$!

cleanup() {
  if ps -p "$PROXY_PID" >/dev/null 2>&1; then
    echo "[db-migrate-prod-with-proxy] Stopping Cloud SQL Proxy (pid=$PROXY_PID)..."
    kill "$PROXY_PID" || true
  fi
}
trap cleanup EXIT

# Wait for proxy to listen on the port
echo "[db-migrate-prod-with-proxy] Waiting for proxy to accept connections on 127.0.0.1:$LOCAL_PORT..."
for i in {1..20}; do
  if nc -z 127.0.0.1 "$LOCAL_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 20 ]]; then
    echo "[db-migrate-prod-with-proxy] ERROR: Timed out waiting for Cloud SQL Proxy on 127.0.0.1:$LOCAL_PORT" >&2
    exit 1
  fi
done

# Prepare DATABASE_URL if not already set
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
    echo "[db-migrate-prod-with-proxy] ERROR: Neither DATABASE_URL nor PROD_DB_PASSWORD is set." >&2
    echo "Set PROD_DB_PASSWORD (recommended) or DATABASE_URL before running this script." >&2
    exit 1
  fi
  export DATABASE_URL="postgresql://${DB_USER}:${PROD_DB_PASSWORD}@127.0.0.1:${LOCAL_PORT}/${DB_NAME}"
  echo "[db-migrate-prod-with-proxy] DATABASE_URL constructed for 127.0.0.1:${LOCAL_PORT}/${DB_NAME}."
else
  echo "[db-migrate-prod-with-proxy] Using existing DATABASE_URL."
fi

echo "[db-migrate-prod-with-proxy] Running prisma migrate deploy against prod..."
cd "$ROOT_DIR/packages/database"

npx prisma migrate deploy --schema=prisma/schema.prisma

echo "[db-migrate-prod-with-proxy] Migrations completed successfully."
