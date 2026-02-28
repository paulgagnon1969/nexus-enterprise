#!/usr/bin/env bash
set -euo pipefail

# Quick deployment status checker
# Shows the current status of the latest GitHub Actions run

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) not installed. Run: brew install gh"
  exit 1
fi

CURRENT_BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "🔍 Checking deployment status for branch: $CURRENT_BRANCH"
echo ""

# Get the latest run
LATEST_RUN=$(gh run list --branch "$CURRENT_BRANCH" --limit 1 --json databaseId,status,conclusion,displayTitle,createdAt,workflowName)

if [[ -z "$LATEST_RUN" || "$LATEST_RUN" == "[]" ]]; then
  echo "❌ No GitHub Actions runs found for branch $CURRENT_BRANCH"
  exit 1
fi

RUN_ID=$(echo "$LATEST_RUN" | jq -r '.[0].databaseId')
STATUS=$(echo "$LATEST_RUN" | jq -r '.[0].status')
CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.[0].conclusion')
TITLE=$(echo "$LATEST_RUN" | jq -r '.[0].displayTitle')
WORKFLOW=$(echo "$LATEST_RUN" | jq -r '.[0].workflowName')

echo "📦 Run #$RUN_ID: $WORKFLOW"
echo "📝 $TITLE"
echo ""

case "$STATUS" in
  "completed")
    case "$CONCLUSION" in
      "success")
        echo "✅ Status: SUCCESS"
        echo ""
        echo "🌐 Production is live with these changes:"
        git log --oneline -3 --decorate
        ;;
      "failure")
        echo "❌ Status: FAILED"
        echo ""
        echo "🔍 Fetching error details..."
        echo ""
        gh run view "$RUN_ID" --log-failed | tail -50
        echo ""
        echo "💡 View full logs: gh run view $RUN_ID --log"
        echo "🔗 Browser: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$RUN_ID"
        exit 1
        ;;
      "cancelled")
        echo "⚠️  Status: CANCELLED"
        ;;
      *)
        echo "⚠️  Status: $CONCLUSION"
        ;;
    esac
    ;;
  "in_progress")
    echo "⏳ Status: IN PROGRESS"
    echo ""
    echo "Watch live: gh run watch $RUN_ID"
    echo "🔗 Browser: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$RUN_ID"
    ;;
  "queued")
    echo "⏰ Status: QUEUED (waiting to start)"
    ;;
  *)
    echo "❓ Status: $STATUS"
    ;;
esac

echo ""
echo "🔗 https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$RUN_ID"
