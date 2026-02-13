#!/bin/bash
# Build Android APK using EAS cloud builds
# DEPRECATED: Use build-android-local.sh for local builds
# Usage: ./scripts/build-android.sh [profile]
# Profiles: preview (default), production

echo "⚠️  This script uses EAS cloud builds."
echo "   For local builds, use: npm run build:android:release"
echo "   Or run: ./scripts/build-android-local.sh"
echo ""
read -p "Continue with EAS build? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 0
fi

set -e

PROFILE="${1:-preview}"
OUTPUT_DIR="/Volumes/4T Data/nexus-builds"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Starting Android build (profile: $PROFILE)..."

# Start the build and capture the build ID
BUILD_OUTPUT=$(eas build --platform android --profile "$PROFILE" --non-interactive --json 2>&1)
BUILD_ID=$(echo "$BUILD_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$BUILD_ID" ]; then
  echo "❌ Failed to start build"
  echo "$BUILD_OUTPUT"
  exit 1
fi

echo "📦 Build started: $BUILD_ID"
echo "⏳ Waiting for build to complete..."

# Poll for completion
while true; do
  STATUS=$(eas build:view "$BUILD_ID" --json 2>/dev/null | grep -o '"status": "[^"]*"' | cut -d'"' -f4)
  
  case "$STATUS" in
    "FINISHED")
      echo "✅ Build complete!"
      break
      ;;
    "ERRORED"|"CANCELED")
      echo "❌ Build failed with status: $STATUS"
      echo "View logs: https://expo.dev/accounts/pg1969/projects/nexus-mobile/builds/$BUILD_ID"
      exit 1
      ;;
    *)
      echo "   Status: $STATUS (checking again in 30s...)"
      sleep 30
      ;;
  esac
done

# Get the download URL
APK_URL=$(eas build:view "$BUILD_ID" --json 2>/dev/null | grep -o '"applicationArchiveUrl": "[^"]*"' | cut -d'"' -f4)

if [ -z "$APK_URL" ]; then
  echo "❌ Could not get APK URL"
  exit 1
fi

# Download to local drive
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/nexus-mobile-$PROFILE-$TIMESTAMP.apk"

echo "⬇️  Downloading APK..."
curl -L "$APK_URL" -o "$OUTPUT_FILE"

# Also keep a "latest" symlink
ln -sf "$OUTPUT_FILE" "$OUTPUT_DIR/nexus-mobile-$PROFILE-latest.apk"

echo ""
echo "✅ APK saved to: $OUTPUT_FILE"
echo "📁 Opening folder..."
open "$OUTPUT_DIR"
