#!/usr/bin/env bash
set -euo pipefail

# Start a Cloud SQL Proxy for PROD, set DATABASE_URL, and then:
# - run a command (if provided), OR
# - drop into an interactive shell (if no command provided)
#
# This is intended to be the "one command" entrypoint for running Prisma
# migrations or ad-hoc scripts against prod via Cloud SQL Proxy.
#
# Examples:
#   # Interactive shell with DATABASE_URL set (proxy is stopped when you exit)
#   ./scripts/prod-db-run-with-proxy.sh
#
#   # Run a one-off command
#   export PROD_DB_PASSWORD="..."
#   ./scripts/prod-db-run-with-proxy.sh -- bash -lc 'cd packages/database && npx prisma migrate deploy --schema prisma/schema.prisma'
#
#   # If port is already in use and you want this script to kill the listener
#   ./scripts/prod-db-run-with-proxy.sh --allow-kill-port

INSTANCE="${INSTANCE:-nexus-enterprise-480610:us-central1:nexusprod-v2}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-nexus_db}"

# If true, kill any process currently listening on LOCAL_PORT.
ALLOW_KILL_PORT="${ALLOW_KILL_PORT:-false}"

# If true, do not prompt for PROD_DB_PASSWORD (error instead).
NO_PROMPT="${NO_PROMPT:-false}"

# Where to write proxy logs.
PROXY_LOG_FILE="${PROXY_LOG_FILE:-/tmp/cloud-sql-proxy-prod.log}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/prod-db-run-with-proxy.sh [options] [--] [command...]

Options:
  --port <port>            Local port for cloud-sql-proxy (default: 5433)
  --instance <conn_name>   Cloud SQL instance connection name
                           (default: nexus-enterprise-480610:us-central1:nexusprod-v2)
  --db <name>              Database name (default: nexus_db)
  --user <name>            Database user (default: postgres)
  --allow-kill-port        Kill existing process listening on the port
  --no-prompt              Fail if PROD_DB_PASSWORD is not set (no interactive prompt)
  -h, --help               Show help

Behavior:
  - Starts cloud-sql-proxy in the background (unless already running for the same instance+port)
  - Exports DATABASE_URL pointing at 127.0.0.1:<port>/<db>
  - If command is provided, runs it and exits
  - If no command is provided, starts an interactive shell; exiting the shell stops the proxy

Security:
  - Does not print DATABASE_URL (to avoid leaking secrets).
  - Provide the password via PROD_DB_PASSWORD env var, or you'll be prompted.
USAGE
}

CMD=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      LOCAL_PORT="$2"; shift 2 ;;
    --instance)
      INSTANCE="$2"; shift 2 ;;
    --db)
      DB_NAME="$2"; shift 2 ;;
    --user)
      DB_USER="$2"; shift 2 ;;
    --allow-kill-port)
      ALLOW_KILL_PORT=true; shift ;;
    --no-prompt)
      NO_PROMPT=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    --)
      shift
      CMD=("$@")
      break
      ;;
    *)
      CMD=("$@")
      break
      ;;
  esac
done

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[prod-db-run-with-proxy] ERROR: gcloud is not installed." >&2
  exit 1
fi

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "[prod-db-run-with-proxy] ERROR: cloud-sql-proxy is not installed or not on PATH." >&2
  exit 1
fi

# Ensure ADC exists (cloud-sql-proxy uses this by default).
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "[prod-db-run-with-proxy] ERROR: Application Default Credentials are invalid or missing." >&2
  echo "[prod-db-run-with-proxy] Run: gcloud auth application-default login" >&2
  exit 1
fi

# If port is in use, either fail or kill it.
EXISTING_PIDS=$(lsof -ti tcp:"$LOCAL_PORT" || true)
if [[ -n "${EXISTING_PIDS}" ]]; then
  if [[ "$ALLOW_KILL_PORT" == "true" ]]; then
    echo "[prod-db-run-with-proxy] Killing existing processes on port $LOCAL_PORT: $EXISTING_PIDS" >&2
    # shellcheck disable=SC2086
    kill $EXISTING_PIDS || true
    sleep 1
  else
    echo "[prod-db-run-with-proxy] ERROR: Port $LOCAL_PORT is already in use (PIDs: $EXISTING_PIDS)." >&2
    echo "[prod-db-run-with-proxy] Either stop the process, choose another port (--port), or pass --allow-kill-port." >&2
    exit 1
  fi
fi

STARTED_PROXY=false

# If a matching proxy is already running, reuse it.
if pgrep -f "cloud-sql-proxy.*${INSTANCE}.*${LOCAL_PORT}" >/dev/null 2>&1; then
  echo "[prod-db-run-with-proxy] Cloud SQL proxy already running for $INSTANCE on port $LOCAL_PORT" >&2
else
  echo "[prod-db-run-with-proxy] Starting Cloud SQL proxy for $INSTANCE on 127.0.0.1:$LOCAL_PORT" >&2
  nohup cloud-sql-proxy --port="$LOCAL_PORT" "$INSTANCE" >"$PROXY_LOG_FILE" 2>&1 &
  PROXY_PID=$!
  STARTED_PROXY=true
fi

cleanup() {
  if [[ "$STARTED_PROXY" == "true" ]]; then
    if ps -p "$PROXY_PID" >/dev/null 2>&1; then
      echo "[prod-db-run-with-proxy] Stopping Cloud SQL proxy (pid=$PROXY_PID)..." >&2
      kill "$PROXY_PID" || true
    fi
  fi
}
trap cleanup EXIT

# Wait for proxy to listen
for i in {1..20}; do
  if nc -z 127.0.0.1 "$LOCAL_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 20 ]]; then
    echo "[prod-db-run-with-proxy] ERROR: Timed out waiting for Cloud SQL Proxy on 127.0.0.1:$LOCAL_PORT" >&2
    echo "[prod-db-run-with-proxy] Proxy log: $PROXY_LOG_FILE" >&2
    exit 1
  fi
done

if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
  if [[ "$NO_PROMPT" == "true" ]]; then
    echo "[prod-db-run-with-proxy] ERROR: PROD_DB_PASSWORD is not set (and --no-prompt was provided)." >&2
    exit 1
  fi
  read -s -p "Enter PROD_DB_PASSWORD: " PROD_DB_PASSWORD
  echo
  if [[ -z "${PROD_DB_PASSWORD}" ]]; then
    echo "[prod-db-run-with-proxy] ERROR: PROD_DB_PASSWORD cannot be empty." >&2
    exit 1
  fi
fi

export DATABASE_URL="postgresql://${DB_USER}:${PROD_DB_PASSWORD}@127.0.0.1:${LOCAL_PORT}/${DB_NAME}?schema=public"

# Run command or open a subshell.
if [[ ${#CMD[@]} -gt 0 ]]; then
  (cd "$ROOT_DIR" && "${CMD[@]}")
else
  echo "[prod-db-run-with-proxy] DATABASE_URL is set in this shell session." >&2
  echo "[prod-db-run-with-proxy] Exiting the shell will stop the proxy." >&2
  "${SHELL:-bash}"
fi
