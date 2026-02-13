#!/bin/bash
# Build Android APK locally (no EAS cloud)
# Usage: ./scripts/build-android-local.sh [debug|release]

set -e

# Force Java 17 for React Native compatibility
export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home')"
export PATH="$JAVA_HOME/bin:$PATH"

VARIANT="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="/Volumes/4T Data/nexus-builds"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

cd "$APP_DIR"

echo "🔧 Building Android APK locally (variant: $VARIANT)..."
echo ""

# Check for Android SDK
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
  # Try common macOS locations
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  else
    echo "❌ ANDROID_HOME not set and Android SDK not found"
    echo "   Install Android Studio or set ANDROID_HOME manually"
    exit 1
  fi
fi

SDK_PATH="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
echo "📱 Using Android SDK: $SDK_PATH"

# Check for Java
if ! command -v java &> /dev/null; then
  echo "❌ Java not found. Install Java 17 for React Native 0.83+"
  exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1)
echo "☕ Java: $JAVA_VERSION"
echo ""

# Generate native project if needed
if [ ! -d "android" ]; then
  echo "📦 Generating native Android project..."
  npx expo prebuild --platform android --clean
fi

# Set production API URL for release builds
if [ "$VARIANT" = "release" ]; then
  export EXPO_PUBLIC_API_BASE_URL="https://nexus-api-979156454944.us-central1.run.app"
  echo "🌐 API URL: $EXPO_PUBLIC_API_BASE_URL"
fi

# Build dependencies first
echo "📦 Building workspace dependencies..."
npm run build:deps

# Run the build
echo ""
echo "🔨 Compiling Android ($VARIANT)..."
npx expo run:android --variant "$VARIANT" --no-install

# Find the APK
if [ "$VARIANT" = "release" ]; then
  APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
else
  APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
fi

if [ ! -f "$APK_PATH" ]; then
  echo "❌ APK not found at: $APK_PATH"
  echo "   Check the build output above for errors"
  exit 1
fi

# Copy to output directory if it exists
if [ -d "/Volumes/4T Data" ]; then
  mkdir -p "$OUTPUT_DIR"
  OUTPUT_FILE="$OUTPUT_DIR/nexus-mobile-$VARIANT-$TIMESTAMP.apk"
  cp "$APK_PATH" "$OUTPUT_FILE"
  ln -sf "$OUTPUT_FILE" "$OUTPUT_DIR/nexus-mobile-$VARIANT-latest.apk"
  
  echo ""
  echo "✅ APK copied to: $OUTPUT_FILE"
  echo "📁 Opening folder..."
  open "$OUTPUT_DIR"
else
  echo ""
  echo "✅ APK built at: $APP_DIR/$APK_PATH"
  echo "📁 Opening folder..."
  open "$APP_DIR/android/app/build/outputs/apk/$VARIANT"
fi

echo ""
echo "📲 To install on a connected device:"
echo "   adb install -r \"$APK_PATH\""
