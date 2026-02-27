#!/usr/bin/env bash
set -euo pipefail

# Deploy the Nexus Worker (BullMQ import worker) to Cloud Run.
#
# Uses the SAME Docker image as the API but overrides the CMD to run
# the worker-http entry point (worker + health-check HTTP server).
#
# Usage:
#   ./scripts/deploy-worker.sh
#
# Prereqs:
#   - gcloud CLI installed and authenticated
#   - You have access to project nexus-enterprise-480610
#   - REDIS_URL and DATABASE_URL are set on the nexus-worker Cloud Run service

PROJECT_ID="nexus-enterprise-480610"
REGION="us-central1"
SERVICE="nexus-worker"
IMAGE="us-docker.pkg.dev/${PROJECT_ID}/nexus-api/nexus-api"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-worker] Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "[deploy-worker] Building image with Cloud Build..."
BUILD_OP=$(gcloud builds submit \
  --tag "$IMAGE" \
  --project "$PROJECT_ID" \
  --async \
  --format="value(id)")

echo "[deploy-worker] Build started: $BUILD_OP"
echo "[deploy-worker] Waiting for build to complete..."

while true; do
  STATUS=$(gcloud builds describe "$BUILD_OP" --project="$PROJECT_ID" --format="value(status)" 2>/dev/null || echo "UNKNOWN")
  if [ "$STATUS" = "SUCCESS" ]; then
    echo "[deploy-worker] Build completed successfully!"
    break
  elif [ "$STATUS" = "FAILURE" ] || [ "$STATUS" = "CANCELLED" ] || [ "$STATUS" = "TIMEOUT" ]; then
    echo "[deploy-worker] Build failed with status: $STATUS"
    exit 1
  fi
  echo "[deploy-worker] Build status: $STATUS - waiting..."
  sleep 10
done

echo "[deploy-worker] Deploying to Cloud Run service: $SERVICE ($REGION)"
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --command "node" \
  --args "dist/worker-http.js" \
  --cpu 2 \
  --memory 2Gi \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 1 \
  --timeout 900 \
  --no-allow-unauthenticated \
  --port 8080 \
  --cpu-boost

echo "[deploy-worker] Done. Worker service deployed to Cloud Run."
echo "[deploy-worker] Verify: gcloud run services describe $SERVICE --region=$REGION"
