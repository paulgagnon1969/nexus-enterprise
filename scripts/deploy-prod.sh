#!/usr/bin/env bash
set -euo pipefail

# If we're not already running in an interactive Terminal session for deploy,
# re-open this script in Terminal so you can see prompts and logs.
if [[ "${DEPLOY_PROD_INNER:-0}" != "1" ]]; then
  /usr/bin/osascript <<'EOF'
  tell application "Terminal"
    activate
    do script "cd /Users/pg/nexus-enterprise && DEPLOY_PROD_INNER=1 ./scripts/deploy-prod.sh"
  end tell
EOF
  exit 0
fi

# Unified "deploy to prod" helper.
# - Loads secrets/config from .env (if present)
# - Ensures GCP Application Default Credentials exist (non-interactively if GOOGLE_APPLICATION_CREDENTIALS is set)
# - Ensures PROD_DB_PASSWORD is set (via environment, e.g. .env)
# - Runs Prisma migrations against prod via Cloud SQL Proxy
# - Deploys the API to Cloud Run via Cloud Build

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Before doing anything, ensure local changes are committed and pushed so
# the prod deploy corresponds to a real git commit.
echo "[deploy-prod] Checking git status..."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "[deploy-prod] WARNING: Not on main (current branch: $CURRENT_BRANCH); skipping auto-commit/push."
  else
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "[deploy-prod] Auto-committing and pushing local changes to main..."
      git add -A
      git commit -m "Prod deploy $(date -u +'%Y-%m-%d %H:%M:%S UTC')" -m "Co-Authored-By: Warp <agent@warp.dev>" || echo "[deploy-prod] git commit failed or no changes to commit."
      git push origin main || echo "[deploy-prod] git push failed; continuing with deploy using local working tree."
    else
      echo "[deploy-prod] Working tree clean; nothing to commit."
    fi
  fi
fi

# Make sure common CLI tools (gcloud, cloud-sql-proxy, node, npm) are on PATH.
# Include Google Cloud SDK bin in case it was installed under $HOME.
export PATH="$HOME/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# Load .env if present, exporting all variables defined there.
# This allows you to keep PROD_DB_PASSWORD and GOOGLE_APPLICATION_CREDENTIALS in .env.
if [[ -f "$ROOT_DIR/.env" ]]; then
  echo "[deploy-prod] Loading environment from .env..."
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

echo "[deploy-prod] Ensuring GCP Application Default Credentials via gcloud..."
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
  echo "[deploy-prod] Using GOOGLE_APPLICATION_CREDENTIALS from environment..."
  gcloud auth application-default login --cred-file="$GOOGLE_APPLICATION_CREDENTIALS"
else
  echo "[deploy-prod] Using interactive gcloud auth application-default login..."
  gcloud auth application-default login
fi

# Ensure PROD_DB_PASSWORD is available (must come from env / .env)
if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
  echo "[deploy-prod] ERROR: PROD_DB_PASSWORD is not set." >&2
  echo "[deploy-prod] Add PROD_DB_PASSWORD to .env or export it in your shell before running this script." >&2
  exit 1
fi

export PROD_DB_PASSWORD

# Clear any pre-existing DATABASE_URL (e.g., dev/docker) so prod migration
# uses the Cloud SQL Proxy and PROD_DB_PASSWORD via db-migrate-prod-with-proxy.sh.
echo "[deploy-prod] Clearing existing DATABASE_URL so prod migrations use prod credentials..."
unset DATABASE_URL

echo "[deploy-prod] Running Prisma migrations against prod via proxy..."
./scripts/db-migrate-prod-with-proxy.sh

echo "[deploy-prod] Deploying API via Cloud Build..."
./scripts/deploy-api-cloudbuild.sh

echo "[deploy-prod] Done."
