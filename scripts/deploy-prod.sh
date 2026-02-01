#!/usr/bin/env bash
set -euo pipefail

# Unified "deploy to prod" helper.
# - Ensures GCP Application Default Credentials exist (prompts via browser if not)
# - Ensures PROD_DB_PASSWORD is set (prompts securely if missing)
# - Runs Prisma migrations against prod via Cloud SQL Proxy
# - Deploys the API to Cloud Run via Cloud Build

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-prod] Checking GCP Application Default Credentials..."
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "[deploy-prod] ADC not found. Launching browser for gcloud auth..."
  gcloud auth application-default login
  echo "[deploy-prod] ADC configured."
fi

# Ensure PROD_DB_PASSWORD is available (prompt if not)
if [[ -z "${PROD_DB_PASSWORD:-}" ]]; then
  read -s -p "Enter PROD_DB_PASSWORD: " PROD_DB_PASSWORD
  echo
fi

export PROD_DB_PASSWORD

echo "[deploy-prod] Running Prisma migrations against prod via proxy..."
./scripts/db-migrate-prod-with-proxy.sh

echo "[deploy-prod] Deploying API via Cloud Build..."
./scripts/deploy-api-cloudbuild.sh

echo "[deploy-prod] Done."
