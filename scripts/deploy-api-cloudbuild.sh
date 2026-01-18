#!/usr/bin/env bash
set -euo pipefail

# Build + deploy nexus-api via Cloud Build using cloudbuild.yaml.
# Usage:
#   ./scripts/deploy-api-cloudbuild.sh

PROJECT_ID="nexus-enterprise-480610"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-api-cloudbuild] Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "[deploy-api-cloudbuild] Submitting Cloud Build with cloudbuild.yaml..."
gcloud builds submit --config=cloudbuild.yaml .

echo "[deploy-api-cloudbuild] Done. Check Cloud Build and Cloud Run for status."
