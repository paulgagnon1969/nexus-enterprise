import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";

const MAPBOX_TOKEN =
  (Constants.expoConfig?.extra as any)?.mapboxPublicToken ?? "";

let initialized = false;

/**
 * Call once at app startup (before any <MapView> renders).
 * Safe to call multiple times — only the first invocation takes effect.
 */
export function initMapbox() {
  if (initialized) return;
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "YOUR_MAPBOX_PUBLIC_TOKEN_HERE") {
    console.warn(
      "[Mapbox] No access token configured. Set extra.mapboxPublicToken in app.json.",
    );
  }
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  initialized = true;
}

export { MAPBOX_TOKEN };
