#!/usr/bin/env bash
set -euo pipefail

# Clone a Cloud SQL Postgres database (dev or prod) into the LOCAL DOCKER
# Postgres used by dev-start.sh.
#
# This is **destructive** for the local Docker DB: it drops and recreates the
# public schema in `nexus_db` on 127.0.0.1:5433 and restores from a dump.
#
# Usage examples:
#   # 1) Clone DEV Cloud SQL -> local Docker (recommended default)
#   DEV_DB_PASSWORD="..." \
#     scripts/clone-cloudsql-to-local-docker.sh --source=dev
#
#   # 2) Clone PROD Cloud SQL -> local Docker (high caution)
#   PROD_DB_PASSWORD="..." \
#     scripts/clone-cloudsql-to-local-docker.sh --source=prod
#
#   # 3) Use an existing dump file (skips creating a new dump)
#   DUMP_FILE=/tmp/nexusdev-20260205180000.dump \
#     scripts/clone-cloudsql-to-local-docker.sh --source=dev
#
# Environment variables:
#   SOURCE              dev|prod (or via --source, default: dev)
#   DUMP_FILE           Optional; if set, script will *not* create a new dump
#   DEV_DB_PASSWORD     Required when SOURCE=dev and no DUMP_FILE is provided
#   PROD_DB_PASSWORD    Required when SOURCE=prod and no DUMP_FILE is provided
#   FORCE               If "true", skip interactive confirmation prompt
#
# Local Docker DB assumptions (matches infra/docker/docker-compose.yml):
#   Host:     127.0.0.1
#   Port:     5433
#   DB name:  nexus_db
#   User:     nexus_user
#   Password: nexus_password

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SOURCE="${SOURCE:-dev}"        # dev | prod
FORCE="${FORCE:-false}"        # true | false
DUMP_FILE="${DUMP_FILE:-}"

LOCAL_DB_HOST="127.0.0.1"
LOCAL_DB_PORT="5433"
LOCAL_DB_NAME="nexus_db"
LOCAL_DB_USER="nexus_user"
LOCAL_DB_PASSWORD="nexus_password"

# Dev Cloud SQL instance (for SOURCE=dev)
DEV_INSTANCE_CONN="nexus-enterprise-480610:us-central1:nexusdev-v2"
DEV_PROXY_PORT="6543"   # separate from 5433 to avoid killing local Docker

# Prod Cloud SQL proxy port (separate from 5433 to avoid killing local Docker)
PROD_PROXY_PORT="6544"

usage() {
  cat <<'USAGE'
Usage:
  scripts/clone-cloudsql-to-local-docker.sh [--source=dev|prod] [--force]

Options:
  --source=dev|prod    Choose Cloud SQL source instance (default: dev)
  --force              Skip interactive confirmation prompt (DANGEROUS)
  -h, --help           Show this help

Environment:
  DEV_DB_PASSWORD      Required for SOURCE=dev when creating a new dump
  PROD_DB_PASSWORD     Required for SOURCE=prod when creating a new dump
  DUMP_FILE            Optional. If set, use this existing dump and skip dump step
  FORCE                If "true", same as --force
USAGE
}

# --- Parse arguments --------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source=*)
      SOURCE="${1#*=}"; shift ;;
    --source)
      SOURCE="$2"; shift 2 ;;
    --force)
      FORCE=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "[clone-cloudsql] Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$SOURCE" != "dev" && "$SOURCE" != "prod" ]]; then
  echo "[clone-cloudsql] ERROR: --source must be 'dev' or 'prod' (got: $SOURCE)" >&2
  exit 2
fi

# --- Safety confirmation ----------------------------------------------------

echo "[clone-cloudsql] WARNING: This will DROP and RECREATE the 'public' schema in your LOCAL Docker DB." >&2
echo "[clone-cloudsql] Target: postgresql://${LOCAL_DB_USER}:****@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}" >&2

echo "[clone-cloudsql] Source: $SOURCE Cloud SQL instance" >&2
if [[ -z "$DUMP_FILE" ]]; then
  echo "[clone-cloudsql] A fresh dump will be created from the $SOURCE Cloud SQL instance." >&2
else
  echo "[clone-cloudsql] Using existing dump file: $DUMP_FILE" >&2
fi

if [[ "$FORCE" != "true" ]]; then
  echo >&2
  echo "Type CLONE_LOCAL_DB to proceed, or anything else to abort:" >&2
  read -r CONFIRM
  if [[ "$CONFIRM" != "CLONE_LOCAL_DB" ]]; then
    echo "[clone-cloudsql] Aborted by user." >&2
    exit 1
  fi
fi

# --- Basic tooling checks ---------------------------------------------------

for cmd in psql pg_dump pg_restore; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[clone-cloudsql] ERROR: '$cmd' is not installed or not on PATH." >&2
    exit 1
  fi
done

# --- Ensure local Docker Postgres is reachable -----------------------------

if command -v nc >/dev/null 2>&1; then
  if ! nc -z "$LOCAL_DB_HOST" "$LOCAL_DB_PORT" >/dev/null 2>&1; then
    echo "[clone-cloudsql] ERROR: No Postgres listening on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}." >&2
    echo "[clone-cloudsql] Hint: run 'docker compose -f infra/docker/docker-compose.yml up -d postgres'" >&2
    exit 1
  fi
else
  echo "[clone-cloudsql] WARNING: 'nc' not found; skipping local DB port check." >&2
fi

# --- Helper: create dump from DEV Cloud SQL --------------------------------

create_dev_dump() {
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "[clone-cloudsql] ERROR: gcloud is not installed (required for dev proxy)." >&2
    exit 1
  fi
  if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
    echo "[clone-cloudsql] ERROR: cloud-sql-proxy is not installed or not on PATH." >&2
    exit 1
  fi
  if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
    echo "[clone-cloudsql] ERROR: Application Default Credentials are missing or invalid." >&2
    echo "[clone-cloudsql] Run: gcloud auth application-default login" >&2
    exit 1
  fi

  if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
    echo "[clone-cloudsql] ERROR: DEV_DB_PASSWORD is not set (required for SOURCE=dev)." >&2
    exit 1
  fi

  local proxy_log="/tmp/cloud-sql-proxy-dev.log"
  local proxy_pid=""

  echo "[clone-cloudsql] Starting Cloud SQL proxy to DEV ($DEV_INSTANCE_CONN) on 127.0.0.1:${DEV_PROXY_PORT}..." >&2
  nohup cloud-sql-proxy --port="$DEV_PROXY_PORT" "$DEV_INSTANCE_CONN" >"$proxy_log" 2>&1 &
  proxy_pid=$!

  # Wait for proxy to be ready
  for i in {1..20}; do
    if nc -z 127.0.0.1 "$DEV_PROXY_PORT" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
    if [[ "$i" -eq 20 ]]; then
      echo "[clone-cloudsql] ERROR: Timed out waiting for dev Cloud SQL proxy on port $DEV_PROXY_PORT" >&2
      echo "[clone-cloudsql] Proxy log: $proxy_log" >&2
      kill "$proxy_pid" >/dev/null 2>&1 || true
      exit 1
    fi
  done

  trap '[[ -n "${proxy_pid:-}" ]] && kill "${proxy_pid}" >/dev/null 2>&1 || true' EXIT

  if [[ -z "$DUMP_FILE" ]]; then
    DUMP_FILE="/tmp/nexusdev-$(date +%Y%m%d%H%M%S).dump"
  fi

  echo "[clone-cloudsql] Creating DEV dump at $DUMP_FILE..." >&2
  PGPASSWORD="$DEV_DB_PASSWORD" \
    pg_dump \
      --format=custom \
      --no-owner \
      --no-privileges \
      --host=127.0.0.1 \
      --port="$DEV_PROXY_PORT" \
      --username=postgres \
      "$LOCAL_DB_NAME" \
      >"$DUMP_FILE"

  echo "[clone-cloudsql] DEV dump created at $DUMP_FILE" >&2
}

# --- Helper: create dump from PROD Cloud SQL -------------------------------

create_prod_dump() {
  if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
    echo "[clone-cloudsql] ERROR: PROD_DB_PASSWORD is not set (required for SOURCE=prod)." >&2
    exit 1
  fi

  if [[ -z "$DUMP_FILE" ]]; then
    DUMP_FILE="/tmp/nexusprod-$(date +%Y%m%d%H%M%S).dump"
  fi

  echo "[clone-cloudsql] Creating PROD dump at $DUMP_FILE via prod-db-run-with-proxy.sh..." >&2

  # Use a DIFFERENT port for Cloud SQL proxy so we don't kill local Docker postgres.
  # We explicitly use pg_dump from PostgreSQL 18 to support dumping from a
  # Postgres 18 Cloud SQL server.
  PROD_DB_PASSWORD="$PROD_DB_PASSWORD" \
  DUMP_FILE="$DUMP_FILE" \
  PROD_PROXY_PORT="$PROD_PROXY_PORT" \
    "$ROOT_DIR/scripts/prod-db-run-with-proxy.sh" --port "$PROD_PROXY_PORT" -- bash -lc '
      set -euo pipefail
      : "${PROD_DB_PASSWORD:?PROD_DB_PASSWORD is required in subshell}"
      : "${DUMP_FILE:?DUMP_FILE is required in subshell}"
      : "${PROD_PROXY_PORT:?PROD_PROXY_PORT is required in subshell}"
      export PGPASSWORD="$PROD_DB_PASSWORD"
      echo "[clone-cloudsql:prod-sub] Running pg_dump to $DUMP_FILE (proxy on port $PROD_PROXY_PORT)" >&2
      PGDUMP_BIN="${PGDUMP_BIN:-/opt/homebrew/opt/postgresql@18/bin/pg_dump}"
      if ! [ -x "$PGDUMP_BIN" ]; then
        echo "[clone-cloudsql:prod-sub] ERROR: pg_dump binary not found or not executable at $PGDUMP_BIN" >&2
        exit 1
      fi
      "$PGDUMP_BIN" \
        --format=custom \
        --no-owner \
        --no-privileges \
        --host=127.0.0.1 \
        --port="$PROD_PROXY_PORT" \
        --username=postgres \
        nexus_db \
        >"$DUMP_FILE"
    '

  echo "[clone-cloudsql] PROD dump created at $DUMP_FILE" >&2
}

# --- Step 1: Ensure we have a dump file ------------------------------------

if [[ -z "$DUMP_FILE" ]]; then
  if [[ "$SOURCE" == "dev" ]]; then
    create_dev_dump
  else
    create_prod_dump
  fi
else
  if [[ ! -f "$DUMP_FILE" ]]; then
    echo "[clone-cloudsql] ERROR: DUMP_FILE does not exist: $DUMP_FILE" >&2
    exit 1
  fi
  echo "[clone-cloudsql] Using existing dump file: $DUMP_FILE" >&2
fi

# --- Step 2: Restore dump into local Docker Postgres -----------------------

echo "[clone-cloudsql] Restoring dump into local Docker DB..." >&2

export PGPASSWORD="$LOCAL_DB_PASSWORD"

# Drop and recreate public schema
psql \
  --host="$LOCAL_DB_HOST" \
  --port="$LOCAL_DB_PORT" \
  --username="$LOCAL_DB_USER" \
  --dbname="$LOCAL_DB_NAME" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION $LOCAL_DB_USER;"

# Restore from dump
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --host="$LOCAL_DB_HOST" \
  --port="$LOCAL_DB_PORT" \
  --username="$LOCAL_DB_USER" \
  --dbname="$LOCAL_DB_NAME" \
  "$DUMP_FILE"

echo "[clone-cloudsql] DONE. Local Docker DB now reflects $SOURCE Cloud SQL snapshot from: $DUMP_FILE" >&2
