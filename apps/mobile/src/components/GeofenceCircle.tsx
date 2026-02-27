import React, { useMemo } from "react";
import Mapbox from "@rnmapbox/maps";
import circle from "@turf/circle";

interface GeofenceCircleProps {
  /** Unique id (used as ShapeSource key) */
  id: string;
  longitude: number;
  latitude: number;
  /** Radius in meters (default 150) */
  radiusMeters?: number;
  /** True when the user is currently inside this geofence */
  isInside?: boolean;
}

/**
 * Renders a translucent circle (geofence boundary) on a Mapbox map.
 * Green when the user is inside, blue when outside.
 */
export function GeofenceCircle({
  id,
  longitude,
  latitude,
  radiusMeters = 150,
  isInside = false,
}: GeofenceCircleProps) {
  const geoJson = useMemo(() => {
    return circle([longitude, latitude], radiusMeters / 1000, {
      steps: 64,
      units: "kilometers",
    });
  }, [longitude, latitude, radiusMeters]);

  const fillColor = isInside
    ? "rgba(34, 197, 94, 0.12)" // green
    : "rgba(14, 165, 233, 0.10)"; // blue

  const lineColor = isInside
    ? "rgba(34, 197, 94, 0.50)"
    : "rgba(14, 165, 233, 0.40)";

  return (
    <Mapbox.ShapeSource id={`geofence-${id}`} shape={geoJson}>
      <Mapbox.FillLayer
        id={`geofence-fill-${id}`}
        style={{ fillColor, fillAntialias: true }}
      />
      <Mapbox.LineLayer
        id={`geofence-line-${id}`}
        style={{
          lineColor,
          lineWidth: 1.5,
          lineDasharray: [4, 3],
        }}
      />
    </Mapbox.ShapeSource>
  );
}
