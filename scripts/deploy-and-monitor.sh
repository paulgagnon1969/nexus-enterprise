#!/usr/bin/env bash
set -euo pipefail

# Automated deployment with GitHub Actions monitoring
# This script:
# 1. Commits and pushes changes
# 2. Waits for GitHub Actions to start
# 3. Monitors the deployment in real-time
# 4. Automatically fetches and displays errors if deployment fails
# 5. Shows success summary if deployment succeeds

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 NEXUS DEPLOYMENT MONITOR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed."
  echo "   Install it with: brew install gh"
  echo "   Then authenticate: gh auth login"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub CLI."
  echo "   Run: gh auth login"
  exit 1
fi

# Step 1: Check git status
echo "📋 Step 1: Checking git status..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "   Branch: $CURRENT_BRANCH"

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "⚠️  Warning: Not on main branch (current: $CURRENT_BRANCH)"
  read -p "   Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
  fi
fi

# Step 2: Commit and push changes
if [[ -n "$(git status --porcelain)" ]]; then
  echo ""
  echo "📝 Step 2: Uncommitted changes detected"
  git status --short
  echo ""
  read -p "   Commit message (or press Enter for auto-message): " COMMIT_MSG
  
  if [[ -z "$COMMIT_MSG" ]]; then
    COMMIT_MSG="deploy: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
  fi
  
  echo "   Committing: $COMMIT_MSG"
  git add -A
  git commit -m "$COMMIT_MSG" -m "Co-Authored-By: Oz <oz-agent@warp.dev>" || {
    echo "❌ Git commit failed"
    exit 1
  }
  
  echo "   Pushing to origin/$CURRENT_BRANCH..."
  git push origin "$CURRENT_BRANCH" || {
    echo "❌ Git push failed"
    exit 1
  }
  echo "   ✅ Changes pushed"
else
  echo "   ✅ Working tree clean, nothing to commit"
  echo "   Checking if already pushed..."
  
  if git log origin/"$CURRENT_BRANCH"..HEAD | grep -q .; then
    echo "   📤 Local commits not pushed, pushing now..."
    git push origin "$CURRENT_BRANCH" || {
      echo "❌ Git push failed"
      exit 1
    }
    echo "   ✅ Changes pushed"
  else
    echo "   ✅ Already up to date with origin"
  fi
fi

# Step 3: Wait for GitHub Actions to start
echo ""
echo "⏳ Step 3: Waiting for GitHub Actions to start..."
echo "   (This usually takes 5-10 seconds)"

sleep 5

# Get the latest workflow run
LATEST_RUN_ID=$(gh run list --branch "$CURRENT_BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId')

if [[ -z "$LATEST_RUN_ID" ]]; then
  echo "❌ Could not find GitHub Actions run"
  echo "   Check manually at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions"
  exit 1
fi

echo "   ✅ Found run: #$LATEST_RUN_ID"
echo "   🔗 https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$LATEST_RUN_ID"
echo ""

# Step 4: Monitor the deployment
echo "📊 Step 4: Monitoring deployment..."
echo "   Press Ctrl+C to stop monitoring (deployment will continue)"
echo ""

# Watch the run and capture exit code
set +e
gh run watch "$LATEST_RUN_ID" --exit-status
RUN_EXIT_CODE=$?
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $RUN_EXIT_CODE -eq 0 ]]; then
  # Success!
  echo "✅ DEPLOYMENT SUCCESSFUL!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Get run details
  RUN_DETAILS=$(gh run view "$LATEST_RUN_ID" --json conclusion,startedAt,updatedAt,jobs)
  STARTED_AT=$(echo "$RUN_DETAILS" | jq -r '.startedAt')
  UPDATED_AT=$(echo "$RUN_DETAILS" | jq -r '.updatedAt')
  
  # Calculate duration
  if command -v gdate &> /dev/null; then
    START_EPOCH=$(gdate -d "$STARTED_AT" +%s)
    END_EPOCH=$(gdate -d "$UPDATED_AT" +%s)
  else
    START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" +%s 2>/dev/null || echo 0)
    END_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$UPDATED_AT" +%s 2>/dev/null || echo 0)
  fi
  
  if [[ $START_EPOCH -gt 0 && $END_EPOCH -gt 0 ]]; then
    DURATION=$((END_EPOCH - START_EPOCH))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))
    echo "⏱️  Duration: ${MINUTES}m ${SECONDS}s"
  fi
  
  echo ""
  echo "🎯 What was deployed:"
  git log --oneline -5 --decorate
  
  echo ""
  echo "🌐 Production URLs:"
  echo "   API: https://nexus-api-wswbn2e6ta-uc.a.run.app"
  echo "   Web: https://nexus.app (if auto-deployed)"
  echo ""
  
else
  # Failure!
  echo "❌ DEPLOYMENT FAILED!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "🔍 Fetching error logs..."
  echo ""
  
  # Get failed jobs
  FAILED_JOBS=$(gh run view "$LATEST_RUN_ID" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .name')
  
  if [[ -z "$FAILED_JOBS" ]]; then
    echo "⚠️  No specific failed jobs found. Showing full log..."
    gh run view "$LATEST_RUN_ID" --log-failed | tail -100
  else
    echo "❌ Failed jobs:"
    echo "$FAILED_JOBS" | while read -r job_name; do
      echo "   • $job_name"
    done
    echo ""
    
    echo "📋 Error logs (last 100 lines):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    gh run view "$LATEST_RUN_ID" --log-failed | tail -100
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "💡 Troubleshooting tips:"
  echo "   1. Check the full logs: gh run view $LATEST_RUN_ID --log"
  echo "   2. View in browser: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$LATEST_RUN_ID"
  echo "   3. Run type check locally: npm run check-types -w apps/api"
  echo "   4. Test build locally: npm run build -w apps/api"
  echo ""
  
  exit 1
fi

echo "✨ Deployment complete!"
