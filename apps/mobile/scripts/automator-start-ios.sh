#!/bin/bash
# Automator-compatible Expo iOS dev server script
# Paste this into Automator > Run Shell Script (shell: /bin/bash)
#
# What it does:
# 1. Kills any existing Metro bundler / Expo process
# 2. Starts fresh: npx expo start --ios

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Source shell profile for nvm/fnm/node
source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true

APP_DIR="/Users/pg/nexus-enterprise/apps/mobile"
cd "$APP_DIR" || exit 1

# ── Kill existing Expo / Metro ──────────────────────────────────────
# Only targets Metro bundler and Expo CLI processes — never touches
# API servers, Docker, or other dev processes.
KILLED=0
for PID in $(pgrep -f "expo start" 2>/dev/null); do
  kill "$PID" 2>/dev/null && KILLED=$((KILLED + 1))
done
for PID in $(pgrep -f "@expo/cli" 2>/dev/null); do
  kill "$PID" 2>/dev/null && KILLED=$((KILLED + 1))
done
# Metro bundler (react-native)
for PID in $(pgrep -f "metro.*bundler" 2>/dev/null); do
  kill "$PID" 2>/dev/null && KILLED=$((KILLED + 1))
done

if [ "$KILLED" -gt 0 ]; then
  echo "♻️  Killed $KILLED existing Expo/Metro process(es)"
  sleep 2  # Give processes time to release ports
fi

# ── Start Expo with iOS simulator ───────────────────────────────────
echo "🚀 Starting Expo dev server + iOS simulator..."
echo "   Dir: $APP_DIR"
echo "   API: ${EXPO_PUBLIC_API_BASE_URL:-$(grep EXPO_PUBLIC_API_BASE_URL .env 2>/dev/null | cut -d= -f2)}"
echo ""

npx expo start --ios
