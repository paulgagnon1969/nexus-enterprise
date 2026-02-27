import React, { useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { GeofenceCircle } from "./GeofenceCircle";
import { CrewDots, type CrewPosition } from "./CrewDots";
import type { ProjectListItem } from "../types/api";
import { colors } from "../theme/colors";

interface ProjectMapProps {
  projects: ProjectListItem[];
  onSelectProject: (project: ProjectListItem) => void;
  /** Project IDs where user is currently clocked in */
  clockedInProjectIds?: Set<string>;
  /** Crew positions (from useCrewTracking) */
  crew?: CrewPosition[];
  currentUserId?: string;
}

function statusColor(status?: string | null): string {
  switch (status?.toLowerCase()) {
    case "active":
    case "in_progress":
      return "#22c55e"; // green
    case "pending":
    case "draft":
      return "#f59e0b"; // amber
    case "closed":
    case "completed":
      return "#9ca3af"; // gray
    default:
      return "#0ea5e9"; // blue (default)
  }
}

/**
 * Full-width Mapbox map showing all projects as pins.
 * Includes geofence circles and optional crew dots.
 */
export function ProjectMap({
  projects,
  onSelectProject,
  clockedInProjectIds,
  crew,
  currentUserId,
}: ProjectMapProps) {
  const cameraRef = useRef<Mapbox.Camera>(null);

  // Filter projects with valid coordinates
  const geoProjects = useMemo(
    () => projects.filter((p) => p.latitude != null && p.longitude != null),
    [projects],
  );

  // Calculate bounds to fit all pins
  const bounds = useMemo(() => {
    if (geoProjects.length === 0) return undefined;
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    for (const p of geoProjects) {
      const lng = p.longitude!;
      const lat = p.latitude!;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // Add padding
    const lngPad = Math.max((maxLng - minLng) * 0.15, 0.005);
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.005);
    return {
      ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
      sw: [minLng - lngPad, minLat - latPad] as [number, number],
    };
  }, [geoProjects]);

  if (geoProjects.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No projects with GPS coordinates to display.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        {/* Camera fitted to all projects */}
        <Mapbox.Camera
          ref={cameraRef}
          bounds={bounds}
          animationDuration={600}
        />

        {/* Current location puck */}
        <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

        {/* Geofence circles */}
        {geoProjects.map((p) => (
          <GeofenceCircle
            key={`gf-${p.id}`}
            id={p.id}
            longitude={p.longitude!}
            latitude={p.latitude!}
            isInside={clockedInProjectIds?.has(p.id)}
          />
        ))}

        {/* Project pins */}
        {geoProjects.map((p) => (
          <Mapbox.PointAnnotation
            key={p.id}
            id={`pin-${p.id}`}
            coordinate={[p.longitude!, p.latitude!]}
            onSelected={() => onSelectProject(p)}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: statusColor(p.status) },
              ]}
            >
              <View style={styles.pinInner} />
            </View>
            <Mapbox.Callout title={p.name}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.city && (
                  <Text style={styles.calloutSub}>
                    {[p.city, p.state].filter(Boolean).join(", ")}
                  </Text>
                )}
                <Text style={styles.calloutAction}>Tap to open ›</Text>
              </View>
            </Mapbox.Callout>
          </Mapbox.PointAnnotation>
        ))}

        {/* Crew dots */}
        {crew && crew.length > 0 && (
          <CrewDots crew={crew} currentUserId={currentUserId} />
        )}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  pinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  callout: {
    minWidth: 140,
    padding: 8,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
  },
  calloutSub: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  calloutAction: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 4,
  },
});
