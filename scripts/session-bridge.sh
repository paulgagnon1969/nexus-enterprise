#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Session Bridge — Bidirectional Session Mirror daemon
#
# Polls the dev-session API for remote comments posted by human users
# (from mobile/web) and surfaces them via:
#   1. macOS Notification Center (terminal-notifier)
#   2. Append to ~/.nexus-session-inbox (JSONL — read by Warp agent)
#
# Usage:
#   bash scripts/session-bridge.sh <session_id>
#   bash scripts/session-bridge.sh <session_id> <auth_token>
#   bash scripts/session-bridge.sh --latest          # auto-pick most recent active session
#
# If no token is provided, reads from apps/api/.env (ACCESS_TOKEN) or
# prompts for one.
#
# To stop: kill the process or Ctrl+C
# ═══════════════════════════════════════════════════════════════════════

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${SESSION_BRIDGE_API:-https://staging-api.nfsgrp.com}"
INBOX_FILE="$HOME/.nexus-session-inbox"
POLL_INTERVAL="${SESSION_BRIDGE_POLL:-5}"  # seconds
SEEN_FILE="/tmp/.session-bridge-seen-$$"

# ── Args ──────────────────────────────────────────────────────────────

SESSION_ID="$1"
AUTH_TOKEN="$2"

if [[ -z "$AUTH_TOKEN" ]]; then
  # Try to read from env file
  if [[ -f "$REPO_ROOT/apps/api/.env" ]]; then
    AUTH_TOKEN=$(grep -E '^ACCESS_TOKEN=' "$REPO_ROOT/apps/api/.env" 2>/dev/null | head -1 | cut -d= -f2-)
  fi
fi

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "⚠️  No auth token found. Pass as second argument or set ACCESS_TOKEN in apps/api/.env"
  echo "   Usage: bash scripts/session-bridge.sh <session_id> <token>"
  exit 1
fi

if [[ -z "$SESSION_ID" ]]; then
  echo "⚠️  No session ID provided."
  echo "   Usage: bash scripts/session-bridge.sh <session_id> [token]"
  exit 1
fi

# ── Cleanup ───────────────────────────────────────────────────────────

cleanup() {
  rm -f "$SEEN_FILE"
  echo ""
  echo "🔭 Session bridge stopped."
  exit 0
}
trap cleanup EXIT INT TERM

# ── Init ──────────────────────────────────────────────────────────────

touch "$SEEN_FILE"
SINCE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

echo "🔭 Session Bridge started"
echo "   Session:  $SESSION_ID"
echo "   API:      $API_BASE"
echo "   Inbox:    $INBOX_FILE"
echo "   Polling:  every ${POLL_INTERVAL}s"
echo "   Since:    $SINCE"
echo ""
echo "   Waiting for remote messages…"
echo ""

# ── Poll loop ─────────────────────────────────────────────────────────

while true; do
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$API_BASE/dev-session/$SESSION_ID/pending-messages?since=$SINCE" 2>/dev/null)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    # Silent retry on auth errors — token may have expired
    if [[ "$HTTP_CODE" == "401" ]]; then
      echo "⚠️  Auth expired (401). Token may need refresh."
    fi
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Parse JSON array — each element is a COMMENT event
  # Use python3 for reliable JSON parsing (available on macOS)
  MESSAGES=$(echo "$BODY" | python3 -c "
import sys, json
try:
    events = json.load(sys.stdin)
    for e in events:
        eid = e.get('id', '')
        ts = e.get('createdAt', '')
        summary = e.get('summary', '')
        actor = e.get('actorUser') or {}
        first = actor.get('firstName', '')
        last = actor.get('lastName', '')
        name = f'{first} {last}'.strip() or 'User'
        print(json.dumps({'eventId': eid, 'ts': ts, 'from': name, 'text': summary}))
except:
    pass
" 2>/dev/null)

  if [[ -n "$MESSAGES" ]]; then
    while IFS= read -r line; do
      EVENT_ID=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eventId',''))" 2>/dev/null)

      # Skip if already seen
      if grep -qF "$EVENT_ID" "$SEEN_FILE" 2>/dev/null; then
        continue
      fi

      # Mark as seen
      echo "$EVENT_ID" >> "$SEEN_FILE"

      FROM=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('from','User'))" 2>/dev/null)
      TEXT=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('text',''))" 2>/dev/null)
      TS=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ts',''))" 2>/dev/null)

      # Append full message to inbox (JSONL)
      echo "{\"ts\":\"$TS\",\"sessionId\":\"$SESSION_ID\",\"from\":\"$FROM\",\"text\":\"$TEXT\",\"eventId\":\"$EVENT_ID\"}" >> "$INBOX_FILE"

      # macOS notification
      if command -v terminal-notifier &>/dev/null; then
        terminal-notifier \
          -title "🔭 Session Mirror" \
          -subtitle "From: $FROM" \
          -message "$TEXT" \
          -sound "Ping" \
          -group "session-bridge-$SESSION_ID" \
          -appIcon "$REPO_ROOT/apps/mobile/assets/icon.png" \
          2>/dev/null &
      fi

      # Terminal output
      echo "📨 [$FROM] $TEXT"

      # Update the since cursor to this event's timestamp
      SINCE="$TS"

    done <<< "$MESSAGES"
  fi

  sleep "$POLL_INTERVAL"
done
