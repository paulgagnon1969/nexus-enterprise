#!/usr/bin/env bash
set -euo pipefail

# Deploy the Nexus API (apps/api) to Cloud Run.
#
# Usage:
#   ./scripts/deploy-api.sh
#
# Prereqs:
#   - gcloud CLI installed and authenticated
#   - You have access to project nexus-enterprise-480610
#   - Cloud Run service "nexus-api" already configured with DATABASE_URL env var

PROJECT_ID="nexus-enterprise-480610"
REGION="us-central1"
SERVICE="nexus-api"
IMAGE="us-docker.pkg.dev/${PROJECT_ID}/nexus-api/nexus-api"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-api] Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "[deploy-api] Building image with Cloud Build..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project "$PROJECT_ID"

echo "[deploy-api] Deploying to Cloud Run service: $SERVICE ($REGION)"
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated

echo "[deploy-api] Done. Check the Cloud Run URL in the gcloud output above."