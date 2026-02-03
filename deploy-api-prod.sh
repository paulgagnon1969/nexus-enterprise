#!/usr/bin/env bash
set -euo pipefail

# Deploy Nexus API to production (GCP Cloud Run + Cloud SQL via Prisma)
#
# REQUIREMENTS:
# - gcloud CLI authenticated to the correct GCP account/project
# - docker CLI installed and logged in to gcr.io ("gcloud auth configure-docker")
# - DATABASE_URL environment variable set to the **prod** Postgres URL (Cloud SQL)
# - PROJECT_ID set to the target GCP project ID
# - REGION set to the Cloud Run region (e.g. us-central1)
# - SERVICE set to the Cloud Run service name (e.g. nexus-api)
#
# USAGE (example):
#   export PROJECT_ID="your-prod-project-id"
#   export REGION="us-central1"
#   export SERVICE="nexus-api"
#   export DATABASE_URL="postgresql://user:pass@host:port/db?schema=public"
#   ./deploy-api-prod.sh

if [[ -z "${PROJECT_ID:-}" || -z "${REGION:-}" || -z "${SERVICE:-}" ]]; then
  echo "ERROR: PROJECT_ID, REGION, and SERVICE env vars must be set before running this script." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL env var must be set to the **prod** Postgres URL before running this script." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

GIT_SHA="$(git rev-parse --short HEAD)"
IMAGE="gcr.io/${PROJECT_ID}/nexus-api:${GIT_SHA}"

echo "=== Building API Docker image: ${IMAGE} ==="
# Use the API Dockerfile under apps/api
docker build -f apps/api/Dockerfile -t "${IMAGE}" .

echo "=== Pushing image to GCR: ${IMAGE} ==="
docker push "${IMAGE}"

echo "=== Running Prisma migrations against prod DB via scripts/db-migrate-prod.sh ==="
"$ROOT_DIR/scripts/db-migrate-prod.sh"

echo "=== Deploying Cloud Run service: ${SERVICE} in ${REGION} ==="
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --set-env-vars="DATABASE_URL=${DATABASE_URL},NODE_ENV=production"

echo "=== Deployment complete ==="