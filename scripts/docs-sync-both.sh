#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Dual-target document sync — seeds both Dev and Prod with SOPs and CAMs.
#
# Usage:
#   bash scripts/docs-sync-both.sh              # sync SOPs + CAMs to both
#   bash scripts/docs-sync-both.sh --dry-run    # preview only
#   bash scripts/docs-sync-both.sh --dev-only   # sync to dev only
#   bash scripts/docs-sync-both.sh --prod-only  # sync to prod only
#
# Environment (loaded from .env automatically):
#   NEXUS_API_TOKEN      — JWT for prod API (:8000)
#   NEXUS_DEV_API_TOKEN  — JWT for dev API  (:8001)
#                          Falls back to NEXUS_API_TOKEN if the dev API
#                          uses the same JWT secret (e.g. default secret).
# --------------------------------------------------------------------------

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

PROD_URL="${NEXUS_PROD_API_URL:-http://localhost:8000}"
DEV_URL="${NEXUS_DEV_API_URL:-http://localhost:8001}"

PROD_TOKEN="${NEXUS_API_TOKEN}"
DEV_TOKEN="${NEXUS_DEV_API_TOKEN:-$NEXUS_API_TOKEN}"

DRY_RUN=""
SYNC_DEV=true
SYNC_PROD=true

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN="--dry-run" ;;
    --dev-only)  SYNC_PROD=false ;;
    --prod-only) SYNC_DEV=false ;;
  esac
done

sync_target() {
  local label="$1"
  local url="$2"
  local token="$3"

  if [ -z "$token" ]; then
    echo "⚠  Skipping $label — no API token set"
    echo "   Run: NEXUS_API_URL=$url npm run api-token:generate"
    echo ""
    return 1
  fi

  # Quick health check
  local health
  health=$(curl -sf "${url}/health" 2>/dev/null)
  if [ $? -ne 0 ]; then
    echo "⚠  Skipping $label — API not reachable at $url"
    echo ""
    return 1
  fi

  echo "━━━ $label ($url) ━━━"

  # SOPs
  echo "  📄 Syncing SOPs…"
  NEXUS_API_URL="$url" NEXUS_API_TOKEN="$token" \
    npx ts-node "$SCRIPT_DIR/scripts/import-sops.ts" --all $DRY_RUN 2>&1 | \
    sed 's/^/  /'
  echo ""

  # CAMs
  echo "  📊 Syncing CAMs…"
  NEXUS_API_URL="$url" NEXUS_API_TOKEN="$token" \
    npx ts-node "$SCRIPT_DIR/scripts/import-sops.ts" --all --dir docs/cams $DRY_RUN 2>&1 | \
    sed 's/^/  /'
  echo ""
}

echo ""
echo "📚 Document Dual-Sync ${DRY_RUN:+(DRY RUN)}"
echo ""

RESULTS=0

if [ "$SYNC_PROD" = true ]; then
  sync_target "PRODUCTION" "$PROD_URL" "$PROD_TOKEN"
  RESULTS=$((RESULTS + $?))
fi

if [ "$SYNC_DEV" = true ]; then
  sync_target "DEV" "$DEV_URL" "$DEV_TOKEN"
  RESULTS=$((RESULTS + $?))
fi

if [ $RESULTS -eq 0 ]; then
  echo "✅ All targets synced."
else
  echo "⚠  Some targets were skipped (see above)."
fi
