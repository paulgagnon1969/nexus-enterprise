import { MAPBOX_TOKEN } from "../map/mapboxConfig";

export interface RouteResult {
  /** GeoJSON LineString geometry of the route */
  geometry: GeoJSON.Geometry;
  /** Duration in seconds */
  durationSec: number;
  /** Distance in meters */
  distanceMeters: number;
  /** Full GeoJSON FeatureCollection (for ShapeSource) */
  geoJson: GeoJSON.FeatureCollection;
}

/**
 * Fetch a driving route between two points using the Mapbox Directions API.
 */
export async function fetchRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<RouteResult> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Directions API error: ${res.status}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No route found");

  const geometry = route.geometry as GeoJSON.Geometry;

  return {
    geometry,
    durationSec: route.duration,
    distanceMeters: route.distance,
    geoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry,
        },
      ],
    },
  };
}

/** Format seconds into human-readable duration */
export function formatDuration(secs: number): string {
  if (secs < 60) return "< 1 min";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

/** Format meters into human-readable distance */
export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 0.1
    ? `${Math.round(meters)} ft`
    : `${miles.toFixed(1)} mi`;
}
