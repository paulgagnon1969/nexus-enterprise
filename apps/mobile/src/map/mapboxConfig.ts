import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";

/**
 * Reads the Mapbox public token from EXPO_PUBLIC_MAPBOX_TOKEN env var
 * (inlined at build time by Metro) with fallback to app.json extra.
 *
 * For EAS builds: set via `eas secret:create`
 * For local builds: exported in build scripts or shell env.
 */
const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  (Constants.expoConfig?.extra as any)?.mapboxPublicToken ||
  "";

let initialized = false;

/**
 * Call once at app startup (before any <MapView> renders).
 * Safe to call multiple times — only the first invocation takes effect.
 */
export function initMapbox() {
  if (initialized) return;
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "YOUR_MAPBOX_PUBLIC_TOKEN_HERE") {
    console.warn(
      "[Mapbox] No access token configured. Set EXPO_PUBLIC_MAPBOX_TOKEN env var.",
    );
  }
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  initialized = true;
}

export { MAPBOX_TOKEN };
