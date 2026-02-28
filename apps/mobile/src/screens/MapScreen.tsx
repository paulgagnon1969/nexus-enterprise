import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated as RNAnimated,
} from "react-native";
import Mapbox from "@rnmapbox/maps";

/** Lightweight type matching @rnmapbox/maps ShapeSource onPress event */
interface MapPressEvent {
  features: Array<GeoJSON.Feature<GeoJSON.Geometry>>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
}
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusKey = "active" | "pending" | "closed";

const STATUS_CHIPS: { key: StatusKey; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#22c55e" },
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "closed", label: "Closed", color: "#9ca3af" },
];

function normalizeStatus(s?: string | null): StatusKey {
  switch (s?.toLowerCase()) {
    case "active":
    case "in_progress":
      return "active";
    case "pending":
    case "draft":
      return "pending";
    case "closed":
    case "completed":
      return "closed";
    default:
      return "active";
  }
}

function statusColor(s: StatusKey): string {
  return STATUS_CHIPS.find((c) => c.key === s)?.color ?? "#0ea5e9";
}

// ─── GeoJSON builder ──────────────────────────────────────────────────────────

function toGeoJson(
  projects: ProjectListItem[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: projects
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        type: "Feature" as const,
        id: p.id,
        geometry: {
          type: "Point" as const,
          coordinates: [p.longitude!, p.latitude!],
        },
        properties: {
          id: p.id,
          name: p.name,
          status: normalizeStatus(p.status),
          statusColor: statusColor(normalizeStatus(p.status)),
          city: p.city ?? "",
          state: p.state ?? "",
          address: [p.addressLine1, p.city, p.state].filter(Boolean).join(", "),
        },
      })),
  };
}

function calcBounds(geo: GeoJSON.FeatureCollection<GeoJSON.Point>) {
  if (geo.features.length === 0) return undefined;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const f of geo.features) {
    const [lng, lat] = f.geometry.coordinates;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const lngPad = Math.max((maxLng - minLng) * 0.15, 0.01);
  const latPad = Math.max((maxLat - minLat) * 0.15, 0.01);
  return {
    ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
    sw: [minLng - lngPad, minLat - latPad] as [number, number],
  };
}

// ─── Layer styles ─────────────────────────────────────────────────────────────

/** Cluster bubble — stepped size by point_count */
const clusterCircleStyle: Mapbox.CircleLayerStyle = {
  circleColor: colors.primary,
  circleRadius: [
    "step",
    ["get", "point_count"],
    18, // default (< 10)
    10,
    24, // 10-49
    50,
    32, // 50+
  ] as any,
  circleOpacity: 0.85,
  circleStrokeWidth: 2.5,
  circleStrokeColor: "#ffffff",
};

/** Cluster count label */
const clusterCountStyle: Mapbox.SymbolLayerStyle = {
  textField: ["get", "point_count_abbreviated"] as any,
  textSize: 13,
  textColor: "#ffffff",
  textFont: ["DIN Pro Medium", "Arial Unicode MS Regular"],
  textAllowOverlap: true,
};

/** Individual (unclustered) pin */
const pinCircleStyle: Mapbox.CircleLayerStyle = {
  circleColor: ["get", "statusColor"] as any,
  circleRadius: 10,
  circleStrokeWidth: 2.5,
  circleStrokeColor: "#ffffff",
  circleSortKey: 1,
};

/** Small white dot inside each pin */
const pinInnerStyle: Mapbox.CircleLayerStyle = {
  circleColor: "#ffffff",
  circleRadius: 3.5,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onSelectProject: (project: ProjectListItem) => void;
}

export function MapScreen({ onSelectProject }: Props) {
  // Data
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(
    new Set(["active", "pending", "closed"]),
  );

  // Selected pin callout
  const [selected, setSelected] = useState<ProjectListItem | null>(null);
  const calloutSlide = useRef(new RNAnimated.Value(200)).current;

  // Map refs
  const shapeRef = useRef<Mapbox.ShapeSource>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  // ── Load projects ─────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const cached = await getCache<ProjectListItem[]>("projects.list");
      if (cached) {
        setProjects(cached);
        setLoading(false);
      }
      try {
        const fresh = await apiJson<ProjectListItem[]>("/projects");
        setProjects(fresh);
        await setCache("projects.list", fresh);
      } catch {
        // use cache if available
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      // Status filter
      if (!statusFilters.has(normalizeStatus(p.status))) return false;
      // Text search
      if (q && !p.name.toLowerCase().includes(q)) {
        const addr = [p.addressLine1, p.city, p.state]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!addr.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, statusFilters]);

  const geoData = useMemo(() => toGeoJson(filtered), [filtered]);
  const bounds = useMemo(() => calcBounds(geoData), [geoData]);

  const isFiltered = search.length > 0 || statusFilters.size < 3;

  const toggleStatus = (key: StatusKey) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one active
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilters(new Set(["active", "pending", "closed"]));
  };

  // ── Pin selection ─────────────────────────────────────────────────────────

  const showCallout = useCallback(
    (project: ProjectListItem) => {
      setSelected(project);
      RNAnimated.spring(calloutSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [calloutSlide],
  );

  const hideCallout = useCallback(() => {
    RNAnimated.timing(calloutSlide, {
      toValue: 200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelected(null));
  }, [calloutSlide]);

  // ── Map event handlers ────────────────────────────────────────────────────

  const handleClusterPress = useCallback(
    async (e: MapPressEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const isCluster = feature.properties?.cluster === true;

      if (isCluster) {
        // Zoom into the cluster
        try {
          const clusterId = feature.properties?.cluster_id;
          if (clusterId != null && shapeRef.current) {
            const zoom = await shapeRef.current.getClusterExpansionZoom(clusterId);
            const coords = (feature.geometry as GeoJSON.Point).coordinates;
            cameraRef.current?.setCamera({
              centerCoordinate: coords as [number, number],
              zoomLevel: zoom,
              animationDuration: 500,
            });
          }
        } catch {
          // Fallback: just zoom in
          const coords = (feature.geometry as GeoJSON.Point).coordinates;
          cameraRef.current?.setCamera({
            centerCoordinate: coords as [number, number],
            zoomLevel: 12,
            animationDuration: 500,
          });
        }
      } else {
        // Individual pin — show callout
        const projectId = feature.properties?.id;
        const project = projects.find((p) => p.id === projectId);
        if (project) showCallout(project);
      }
    },
    [projects, showCallout],
  );

  const handleMapPress = useCallback(() => {
    if (selected) hideCallout();
  }, [selected, hideCallout]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && projects.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading projects…</Text>
      </View>
    );
  }

  const geoCount = geoData.features.length;

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onPress={handleMapPress}
      >
        <Mapbox.Camera
          ref={cameraRef}
          bounds={bounds}
          animationDuration={600}
        />

        <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

        <Mapbox.ShapeSource
          id="projects-source"
          ref={shapeRef}
          shape={geoData}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleClusterPress}
        >
          {/* Cluster circles */}
          <Mapbox.CircleLayer
            id="cluster-circles"
            filter={["has", "point_count"]}
            style={clusterCircleStyle}
          />

          {/* Cluster count text */}
          <Mapbox.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={clusterCountStyle}
          />

          {/* Individual pin — outer circle */}
          <Mapbox.CircleLayer
            id="pin-circle"
            filter={["!", ["has", "point_count"]]}
            style={pinCircleStyle}
          />

          {/* Individual pin — inner white dot */}
          <Mapbox.CircleLayer
            id="pin-inner"
            filter={["!", ["has", "point_count"]]}
            style={pinInnerStyle}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {isFiltered && (
            <Pressable style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {STATUS_CHIPS.map((chip) => {
            const active = statusFilters.has(chip.key);
            return (
              <Pressable
                key={chip.key}
                style={[
                  styles.chip,
                  active && { backgroundColor: chip.color, borderColor: chip.color },
                ]}
                onPress={() => toggleStatus(chip.key)}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: active ? "#fff" : chip.color },
                  ]}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    active && { color: "#fff" },
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}

          {/* Summary count */}
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {geoCount} project{geoCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </ScrollView>
      </View>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {geoCount === 0 && !loading && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            {filtered.length === 0
              ? "No projects match your filters."
              : "No projects have GPS coordinates yet."}
          </Text>
        </View>
      )}

      {/* ── Pin callout ─────────────────────────────────────────────────── */}
      {selected && (
        <RNAnimated.View
          style={[
            styles.callout,
            { transform: [{ translateY: calloutSlide }] },
          ]}
        >
          <View style={styles.calloutHandle} />
          <View style={styles.calloutHeader}>
            <View
              style={[
                styles.calloutStatusDot,
                { backgroundColor: statusColor(normalizeStatus(selected.status)) },
              ]}
            />
            <Text style={styles.calloutTitle} numberOfLines={1}>
              {selected.name}
            </Text>
          </View>
          {(selected.city || selected.state) && (
            <Text style={styles.calloutAddress} numberOfLines={1}>
              {[selected.addressLine1, selected.city, selected.state]
                .filter(Boolean)
                .join(", ")}
            </Text>
          )}
          {selected.primaryContactName && (
            <Text style={styles.calloutContact} numberOfLines={1}>
              📞 {selected.primaryContactName}
              {selected.primaryContactPhone
                ? ` · ${selected.primaryContactPhone}`
                : ""}
            </Text>
          )}
          <View style={styles.calloutActions}>
            <Pressable
              style={styles.calloutOpenBtn}
              onPress={() => {
                hideCallout();
                onSelectProject(selected);
              }}
            >
              <Text style={styles.calloutOpenText}>Open Project ›</Text>
            </Pressable>
            <Pressable style={styles.calloutCloseBtn} onPress={hideCallout}>
              <Text style={styles.calloutCloseText}>Dismiss</Text>
            </Pressable>
          </View>
        </RNAnimated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },

  // ── Filter bar ──────────────────────────────────────────────────────────
  filterBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.backgroundTertiary,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    gap: 6,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primary + "18",
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },

  // ── Empty state ─────────────────────────────────────────────────────────
  emptyOverlay: {
    position: "absolute",
    top: "45%",
    left: 24,
    right: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },

  // ── Pin callout (bottom sheet) ──────────────────────────────────────────
  callout: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 12,
  },
  calloutHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMuted,
    alignSelf: "center",
    marginBottom: 12,
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  calloutStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  calloutTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  calloutAddress: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
    marginLeft: 18,
  },
  calloutContact: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    marginLeft: 18,
  },
  calloutActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  calloutOpenBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutOpenText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  calloutCloseText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
