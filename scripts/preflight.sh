#!/usr/bin/env bash
set -euo pipefail

# Preflight checklist for Nexus Enterprise
# - Checks local dev API + web
# - Checks Cloud Run prod API health
# - Checks Vercel prod web login page
# - Optionally checks Cloud SQL dev/prod via Prisma migrate status when flags are set
#
# Usage:
#   ./scripts/preflight.sh
#   DEV_DB_PASSWORD=... ./scripts/preflight.sh --start-dev
#   DEV_DB_PASSWORD=... PROD_DB_PASSWORD=... ./scripts/preflight.sh --check-sql
#   DEV_DB_PASSWORD=... PROD_DB_PASSWORD=... ./scripts/preflight.sh --start-dev --check-sql
#

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOUD_RUN_URL="https://nexus-api-979156454944.us-central1.run.app"
VERCEL_LOGIN_URL="https://nexus-enterprise-web.vercel.app/login"

GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

check_sql=false
start_dev=false

# State flags populated by checks
dev_proxy_ok=true
local_api_ok=true
local_web_ok=true
cloud_run_ok=true
vercel_ok=true

for arg in "$@"; do
  case "$arg" in
    --check-sql)
      check_sql=true
      shift
      ;;
    --start-dev)
      start_dev=true
      shift
      ;;
  esac
done

say_ok() {
  echo -e "${GREEN}✔ $1${RESET}"
}

say_warn() {
  echo -e "${YELLOW}⚠ $1${RESET}"
}

say_fail() {
  echo -e "${RED}✘ $1${RESET}"
}

http_check() {
  local label="$1" url="$2"; shift 2
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [[ "$code" == "200" || "$code" == "302" ]]; then
    say_ok "$label ($code)"
    return 0
  else
    say_fail "$label ($code)"
    return 1
  fi
}

lsof_check() {
  local label="$1" port="$2"; shift 2
  if lsof -i "tcp:${port}" >/dev/null 2>&1; then
    say_ok "$label (port ${port})"
    return 0
  else
    say_warn "$label NOT listening on port ${port}"
    return 1
  fi
}

run_local_checks() {
  dev_proxy_ok=true
  local_api_ok=true
  local_web_ok=true

  if ! lsof_check "Dev Cloud SQL proxy" 5433; then
    dev_proxy_ok=false
  fi

  if ! http_check "Local API /health" "http://localhost:8000/health"; then
    local_api_ok=false
  fi

  if ! http_check "Local web /login" "http://localhost:3000/login"; then
    local_web_ok=false
  fi
}

echo "Nexus Enterprise preflight checks"
echo "Root: ${ROOT_DIR}"
echo

# 1) Local dev stack

run_local_checks

# 2) Cloud Run prod API
if ! http_check "Cloud Run API /health" "${CLOUD_RUN_URL}/health"; then
  cloud_run_ok=false
fi

# 3) Vercel web prod
if ! http_check "Vercel /login" "${VERCEL_LOGIN_URL}"; then
  vercel_ok=false
fi

# Optionally start local dev stack if requested and not healthy
if [[ "$start_dev" == true ]]; then
  if [[ "$dev_proxy_ok" == false || "$local_api_ok" == false || "$local_web_ok" == false ]]; then
    echo
    echo "Attempting to start local dev stack via scripts/dev-start.sh (requires DEV_DB_PASSWORD in env)..."
    if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
      say_fail "DEV_DB_PASSWORD is not set; cannot start dev API against Cloud SQL."
    else
      (
        cd "${ROOT_DIR}" && \
        bash ./scripts/dev-start.sh
      ) || say_fail "scripts/dev-start.sh failed"

      echo
      echo "Re-running local dev checks after dev-start.sh..."
      run_local_checks
    fi
  fi
fi

# 4) Optional: Cloud SQL checks via Prisma migrate status
if [[ "$check_sql" == true ]]; then
  echo
  echo "Cloud SQL checks (--check-sql enabled)"

  if [[ -z "${DEV_DB_PASSWORD:-}" ]]; then
    say_warn "DEV_DB_PASSWORD not set; skipping dev DB check"
  else
    say_ok "Checking dev DB via Prisma migrate status"
    ( \
      cd "${ROOT_DIR}/packages/database" && \
      export DATABASE_URL="postgresql://postgres:${DEV_DB_PASSWORD}@127.0.0.1:5433/nexus_db" && \
      npx prisma migrate status >/dev/null 2>&1 && \
      say_ok "Dev DB reachable and schema status OK" \
    ) || say_fail "Dev DB Prisma migrate status failed"
  fi

  if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
    say_warn "PROD_DB_PASSWORD not set; skipping prod DB check (requires proxy on 5434)"
  else
    say_ok "Checking prod DB via Prisma migrate status (expects proxy on 5434)"
    ( \
      cd "${ROOT_DIR}/packages/database" && \
      export DATABASE_URL="postgresql://postgres:${PROD_DB_PASSWORD}@127.0.0.1:5434/nexus_db" && \
      npx prisma migrate status >/dev/null 2>&1 && \
      say_ok "Prod DB reachable and schema status OK" \
    ) || say_fail "Prod DB Prisma migrate status failed"
  fi
fi

echo

# Final summary
if [[ "$dev_proxy_ok" == true && "$local_api_ok" == true && "$local_web_ok" == true ]]; then
  say_ok "Local dev stack running (proxy + API + web)"
else
  say_warn "Local dev stack NOT fully running (see checks above)"
fi

if [[ "$dev_proxy_ok" == true && "$local_api_ok" == true && "$local_web_ok" == true && "$cloud_run_ok" == true && "$vercel_ok" == true ]]; then
  echo -e "${GREEN}SERVER STACK RUNNING (local + prod healthy)${RESET}"
else
  echo -e "${YELLOW}SERVER STACK NOT FULLY HEALTHY - review checks above${RESET}"
fi

echo
