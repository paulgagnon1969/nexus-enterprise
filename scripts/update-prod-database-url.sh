#!/usr/bin/env bash
set -euo pipefail

# Update DATABASE_URL for the nexus-api Cloud Run service to point at the
# current production Postgres instance (nexusprod-v2 on 34.27.95.130:5432).
#
# Usage:
#   ./scripts/update-prod-database-url.sh
#
# This script is intended for infrequent admin operations:
# - When the prod DB password is rotated
# - When the prod DB instance/host changes

PROJECT_ID="nexus-enterprise-480610"
REGION="us-central1"
SERVICE="nexus-api"

echo "[update-prod-db-url] Project: $PROJECT_ID, Service: $SERVICE, Region: $REGION"
echo "[update-prod-db-url] This will update the DATABASE_URL env var on the Cloud Run service."
read -p "Continue? (y/N): " CONFIRM
CONFIRM=${CONFIRM:-N}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "[update-prod-db-url] Aborted by user."
  exit 1
fi

# Get the password without echoing it (not stored in shell history)
read -s -p "Enter PROD_DB_PASSWORD: " PROD_DB_PASSWORD
echo

if [[ -z "${PROD_DB_PASSWORD}" ]]; then
  echo "[update-prod-db-url] PROD_DB_PASSWORD cannot be empty." >&2
  exit 1
fi

# Build the canonical prod connection string
ProdDATABASE_URL="postgresql://postgres:${PROD_DB_PASSWORD}@34.27.95.130:5432/nexus_db"

echo "[update-prod-db-url] Updating Cloud Run env var DATABASE_URL..."
gcloud run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="DATABASE_URL=${ProdDATABASE_URL}"

echo "[update-prod-db-url] Done. DATABASE_URL updated on Cloud Run service '$SERVICE'."