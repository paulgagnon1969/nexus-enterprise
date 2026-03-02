import { Linking, Platform } from "react-native";
import { getPreferredMapApp, type MapAppType } from "../storage/settings";

interface Destination {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

/**
 * Build a navigation URL for a given map app and destination.
 */
function buildUrl(app: MapAppType, dest: string, lat?: number | null, lng?: number | null): string {
  switch (app) {
    case "waze":
      return lat != null && lng != null
        ? `waze://?ll=${lat},${lng}&navigate=yes`
        : `waze://?q=${encodeURIComponent(dest)}&navigate=yes`;
    case "google":
      return Platform.OS === "ios"
        ? `comgooglemaps://?daddr=${encodeURIComponent(dest)}&directionsmode=driving`
        : `google.navigation:q=${encodeURIComponent(dest)}`;
    case "apple":
      return `maps://?daddr=${encodeURIComponent(dest)}&dirflg=d`;
    default:
      // Fallback: platform default
      return Platform.OS === "ios"
        ? `maps://?daddr=${encodeURIComponent(dest)}&dirflg=d`
        : `google.navigation:q=${encodeURIComponent(dest)}`;
  }
}

/**
 * Open the user's preferred map app for navigation.
 *
 * If no preference is saved, falls back to the platform default
 * (Apple Maps on iOS, Google Maps on Android).
 *
 * Returns the app that was opened, or null if the preferred app
 * wasn't available (caller can show a picker dialog in that case).
 */
export async function openPreferredMap(
  destination: Destination,
): Promise<MapAppType> {
  const preferred = await getPreferredMapApp();
  const dest = destination.address || `${destination.latitude},${destination.longitude}`;

  if (preferred) {
    const url = buildUrl(preferred, dest, destination.latitude, destination.longitude);
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return preferred;
      }
    } catch {
      // App not installed — fall through to platform default
    }
  }

  // No preference or preferred app unavailable — use platform default
  const fallbackApp: MapAppType = Platform.OS === "ios" ? "apple" : "google";
  const fallbackUrl = buildUrl(fallbackApp, dest, destination.latitude, destination.longitude);
  try {
    await Linking.openURL(fallbackUrl);
    return fallbackApp;
  } catch {
    // Last resort: Google Maps web
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
    );
    return null;
  }
}
