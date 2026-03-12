import { MAPBOX_TOKEN } from "../map/mapboxConfig";
import type { ProjectListItem } from "../types/api";

/** In-memory cache so we only reverse-geocode once per session. */
let cachedZip: string | null = null;

/**
 * Resolve the user's ZIP code for supplier catalog searches.
 *
 * Priority:
 *  1. GPS location → Mapbox reverse geocode
 *  2. Selected/first project with a ZIP
 *  3. null (caller should prompt user to enter ZIP)
 */
export async function resolveUserZip(
  userLoc: { lat: number; lng: number } | null,
  projects?: ProjectListItem[],
): Promise<string | null> {
  // Return cached value if we've already resolved
  if (cachedZip) return cachedZip;

  // Strategy 1: Reverse geocode user's GPS
  if (userLoc) {
    const zip = await reverseGeocodeZip(userLoc.lat, userLoc.lng);
    if (zip) {
      cachedZip = zip;
      return zip;
    }
  }

  // Strategy 2: Use the first project that has a ZIP
  if (projects?.length) {
    for (const p of projects) {
      const pZip = (p as any).zip ?? (p as any).zipCode ?? null;
      if (typeof pZip === "string" && /^\d{5}/.test(pZip)) {
        cachedZip = pZip.slice(0, 5);
        return cachedZip;
      }
    }
  }

  return null;
}

/** Clear the cached ZIP (e.g. when user changes location significantly). */
export function clearZipCache() {
  cachedZip = null;
}

/**
 * Reverse geocode lat/lng to a 5-digit US ZIP using Mapbox Geocoding API.
 * Returns null if the API call fails or no postcode is found.
 */
async function reverseGeocodeZip(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;

  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${lng},${lat}.json` +
      `?types=postcode&limit=1&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature?.text) return null;

    // Mapbox returns the full postcode text, e.g. "78133"
    const zip = feature.text.replace(/\D/g, "").slice(0, 5);
    return zip.length === 5 ? zip : null;
  } catch {
    return null;
  }
}
