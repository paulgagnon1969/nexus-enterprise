#!/bin/bash
# Automator-compatible Android build script
# Paste this into Automator > Run Shell Script (shell: /bin/bash)

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home')"
export PATH="$JAVA_HOME/bin:$PATH"

APP_DIR="$HOME/nexus-enterprise/apps/mobile"
OUTPUT_DIR="/Volumes/4T Data/nexus-builds"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="/tmp/nexus-android-build-$TIMESTAMP.log"

cd "$APP_DIR" || exit 1

# Redirect output to log file and terminal
exec > >(tee -a "$LOG_FILE") 2>&1

echo "🔧 Nexus Mobile Android Build"
echo "   Started: $(date)"
echo "   Log: $LOG_FILE"
echo ""

# Generate native project if needed
if [ ! -d "android" ]; then
  echo "📦 Generating native Android project..."
  npx expo prebuild --platform android --clean
fi

# Set production API URL
export EXPO_PUBLIC_API_BASE_URL="https://nexus-api-979156454944.us-central1.run.app"
echo "🌐 API URL: $EXPO_PUBLIC_API_BASE_URL"

# Build dependencies
echo "📦 Building workspace dependencies..."
npm run build:deps

# Build release APK
echo ""
echo "🔨 Compiling Android release..."
npx expo run:android --variant release --no-install

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_PATH" ]; then
  osascript -e 'display notification "Build failed - check log" with title "Nexus Android Build" sound name "Basso"'
  open "$LOG_FILE"
  exit 1
fi

# Copy to output directory
if [ -d "/Volumes/4T Data" ]; then
  mkdir -p "$OUTPUT_DIR"
  OUTPUT_FILE="$OUTPUT_DIR/nexus-mobile-release-$TIMESTAMP.apk"
  cp "$APK_PATH" "$OUTPUT_FILE"
  ln -sf "$OUTPUT_FILE" "$OUTPUT_DIR/nexus-mobile-release-latest.apk"
  
  osascript -e 'display notification "APK ready in nexus-builds folder" with title "Nexus Android Build" sound name "Glass"'
  open "$OUTPUT_DIR"
else
  osascript -e 'display notification "APK ready in android/app/build" with title "Nexus Android Build" sound name "Glass"'
  open "$APP_DIR/android/app/build/outputs/apk/release"
fi

echo ""
echo "✅ Build complete: $(date)"
