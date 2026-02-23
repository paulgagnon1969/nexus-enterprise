#!/usr/bin/env bash
# Patch: create rncompatibility shim in expo-modules-core for expo-updates 55.x
# This bridges the gap until expo-modules-core ships the rncompatibility module.
set -euo pipefail

SHIM_DIR="$(dirname "$0")/../../node_modules/expo-modules-core/android/src/main/java/expo/modules/rncompatibility"

if [ -d "$(dirname "$SHIM_DIR")" ] && [ ! -f "$SHIM_DIR/ReactNativeFeatureFlags.kt" ]; then
  mkdir -p "$SHIM_DIR"
  cat > "$SHIM_DIR/ReactNativeFeatureFlags.kt" << 'KOTLIN'
package expo.modules.rncompatibility

object ReactNativeFeatureFlags {
    @JvmStatic
    val enableBridgelessArchitecture: Boolean
        get() {
            return try {
                val clazz = Class.forName("com.facebook.react.internal.featureflags.ReactNativeFeatureFlags")
                val method = clazz.getMethod("enableBridgelessArchitecture")
                method.invoke(null) as? Boolean ?: false
            } catch (_: Throwable) {
                false
            }
        }
}
KOTLIN
  echo "[patch] Created rncompatibility shim for expo-updates"
fi
