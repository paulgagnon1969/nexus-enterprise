import React, { useEffect, useMemo, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, Platform, Animated as RNAnimated, PanResponder } from "react-native";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { GeofenceCircle } from "./GeofenceCircle";
import { CrewDots, type CrewPosition } from "./CrewDots";
import type { ProjectListItem } from "../types/api";
import { colors } from "../theme/colors";
import { getDefaultProjectZoom, setDefaultProjectZoom, getMapLayerVisibility, setMapLayerVisibility } from "../storage/settings";

// ─── Layer definitions (each row is independently toggleable) ──────────────

const PROJECT_LEGEND = [
  { key: "proj-active",    label: "Active",    color: "#22c55e" },
  { key: "proj-pending",   label: "Pending",   color: "#f59e0b" },
  { key: "proj-completed", label: "Completed", color: "#9ca3af" },
  { key: "proj-default",   label: "Default",   color: "#0ea5e9" },
];
const SUPPLIER_LEGEND = [
  { key: "sup-active",  label: "🏪 Active",  color: "#f97316" },
  { key: "sup-pending", label: "⚠️ Pending", color: "#f59e0b" },
  { key: "sup-closed",  label: "❌ Closed",  color: "#ef4444" },
];
const EXTRA_LAYERS = [
  { key: "geofences", label: "Geofences", color: "#6366f1" },
  { key: "crew",      label: "Crew",      color: "#ec4899" },
];

/** Map a project status string to its legend layer key */
function statusLayerKey(status?: string | null): string {
  switch (status?.toLowerCase()) {
    case "active": case "in_progress": case "open": return "proj-active";
    case "pending": case "draft": return "proj-pending";
    case "closed": case "completed": return "proj-completed";
    default: return "proj-default";
  }
}

/** Approx center of the continental US */
const US_CENTER: [number, number] = [-98.5, 39.8];
const US_ZOOM = 3;

/** Preset diameters for the long-press radius picker (miles).
 *  0 = national US view. */
const RADIUS_PRESETS: { miles: number; label: string }[] = [
  { miles: 0.5, label: "½ mi" },
  { miles: 1,   label: "1 mi" },
  { miles: 2,   label: "2 mi" },
  { miles: 5,   label: "5 mi" },
  { miles: 10,  label: "10 mi" },
  { miles: 15,  label: "15 mi" },
  { miles: 20,  label: "20 mi" },
  { miles: 25,  label: "25 mi" },
  { miles: 50,  label: "50 mi" },
  { miles: 75,  label: "75 mi" },
  { miles: 100, label: "100 mi" },
  { miles: 150, label: "150 mi" },
  { miles: 200, label: "200 mi" },
  { miles: 300, label: "300 mi" },
  { miles: 500, label: "500 mi" },
  { miles: 0,   label: "National (US)" },
];

/** Nav icon cycles through these preset diameters on tap */
const NAV_CYCLE = [20, 50, 100, 0] as const;

const ZOOM_STEP = 5;       // +/- button increment (miles)
const MIN_DIAMETER = 1;     // floor for +/- stepping
const MAX_DIAMETER = 500;   // ceiling before national

/** Display label for a given diameter */
function diameterLabel(d: number): string {
  if (d === 0) return "US";
  if (d === 0.5) return "½ mi";
  return `${d} mi`;
}

/** Build bounds for a radius around a point */
function boundsForMiles(lat: number, lng: number, miles: number) {
  const latPad = (miles / 69) * 1.1;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.08);
  const lngPad = (miles / (cosLat * 69)) * 1.1;
  return {
    ne: [lng + lngPad, lat + latPad] as [number, number],
    sw: [lng - lngPad, lat - latPad] as [number, number],
  };
}

export interface ProjectMapHandle {
  zoomToFit: () => void;
  openRadiusPicker: () => void;
}

interface ProjectMapProps {
  projects: ProjectListItem[];
  onSelectProject: (project: ProjectListItem) => void;
  /** When set, zoom to user’s default diameter around this project */
  focusedProject?: ProjectListItem | null;
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
export const ProjectMap = forwardRef<ProjectMapHandle, ProjectMapProps>(function ProjectMap(
  {
    projects,
    onSelectProject,
    focusedProject,
    clockedInProjectIds,
    crew,
    currentUserId,
  },
  ref,
) {
  const cameraRef = useRef<Mapbox.Camera>(null);

  // Freeform zoom diameter (miles); 0 = national US view
  const [zoomDiameter, setZoomDiameter] = useState(0);
  const [navCycleIdx, setNavCycleIdx] = useState(-1);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [defaultZoom, setDefaultZoom] = useState<number | null>(null);

  // Layer visibility (persisted) — missing key = visible (default on)
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>({});
  const defaultZoomRef = useRef(5); // fallback for focused-project zoom
  const userCoords = useRef<{ lat: number; lng: number } | null>(null);

  // Load persisted layer visibility
  useEffect(() => {
    getMapLayerVisibility().then(setLayerVis).catch(() => {});
  }, []);

  const isLayerOn = useCallback((key: string) => layerVis[key] !== false, [layerVis]);

  const toggleLayer = useCallback((key: string) => {
    setLayerVis((prev) => {
      const next = { ...prev, [key]: prev[key] === false };
      void setMapLayerVisibility(next);
      return next;
    });
  }, []);

  /** Toggle all items in a section at once */
  const toggleSection = useCallback((keys: string[]) => {
    setLayerVis((prev) => {
      const allOn = keys.every((k) => prev[k] !== false);
      const next = { ...prev };
      for (const k of keys) next[k] = allOn ? false : true;
      void setMapLayerVisibility(next);
      return next;
    });
  }, []);

  // Legend drag-to-reposition
  const legendPan = useRef(new RNAnimated.ValueXY()).current;
  const legendOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const legendPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        isDragging.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) isDragging.current = true;
        legendPan.setValue({
          x: legendOffset.current.x + gs.dx,
          y: legendOffset.current.y + gs.dy,
        });
      },
      onPanResponderRelease: (_, gs) => {
        legendOffset.current = {
          x: legendOffset.current.x + gs.dx,
          y: legendOffset.current.y + gs.dy,
        };
        if (!isDragging.current) setLegendOpen((v) => !v);
      },
    })
  ).current;

  // Load default zoom + apply initial view
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await getDefaultProjectZoom();
      if (cancelled) return;
      setDefaultZoom(d);
      defaultZoomRef.current = d ?? 20; // fallback 20 mi when no saved default

      // Get location and fly to default zoom
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        userCoords.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        const cam = cameraRef.current;
        if (!cam) return;
        const zoom = defaultZoomRef.current;
        const b = boundsForMiles(loc.coords.latitude, loc.coords.longitude, zoom / 2);
        cam.fitBounds(b.ne, b.sw, [40, 40, 40, 40], 800);
        setZoomDiameter(zoom);
      } catch {
        // Location unavailable — stay on national
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter projects with valid coordinates, then by layer visibility
  const geoProjects = useMemo(
    () => projects.filter((p) => p.latitude != null && p.longitude != null),
    [projects],
  );

  const visibleProjects = useMemo(
    () => geoProjects.filter((p) => isLayerOn(statusLayerKey(p.status))),
    [geoProjects, isLayerOn],
  );

  const showGeofences = isLayerOn("geofences");
  const showCrew = isLayerOn("crew");

  // Bounds to fit ALL pins (used by zoom-to-fit)
  const allBounds = useMemo(() => {
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
    const lngPad = Math.max((maxLng - minLng) * 0.15, 0.005);
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.005);
    return {
      ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
      sw: [minLng - lngPad, minLat - latPad] as [number, number],
    };
  }, [geoProjects]);

  // When focusedProject changes, fly the camera at the user’s default zoom
  useEffect(() => {
    if (!cameraRef.current) return;
    if (focusedProject && focusedProject.latitude != null && focusedProject.longitude != null) {
      const d = defaultZoomRef.current;
      const b = boundsForMiles(focusedProject.latitude, focusedProject.longitude, d / 2);
      cameraRef.current.fitBounds(b.ne, b.sw, [40, 40, 40, 40], 800);
      setZoomDiameter(d);
    } else if (allBounds) {
      // "All Locations" — fit all pins
      cameraRef.current.fitBounds(allBounds.ne, allBounds.sw, [40, 40, 40, 40], 800);
    }
  }, [focusedProject, allBounds]);

  // Zoom-to-fit handler (exposed via ref for external use)
  const handleZoomToFit = useCallback(() => {
    if (!cameraRef.current || !allBounds) return;
    cameraRef.current.fitBounds(allBounds.ne, allBounds.sw, [40, 40, 40, 40], 800);
  }, [allBounds]);

  useImperativeHandle(
    ref,
    () => ({ zoomToFit: handleZoomToFit, openRadiusPicker: () => {} }),
    [handleZoomToFit],
  );

  // Apply zoom for a given diameter centered on user location
  const applyZoom = useCallback(
    (diameter: number) => {
      const cam = cameraRef.current;
      if (!cam) return;
      if (diameter === 0) {
        cam.setCamera({ centerCoordinate: US_CENTER, zoomLevel: US_ZOOM, animationDuration: 800 });
      } else if (userCoords.current) {
        const b = boundsForMiles(userCoords.current.lat, userCoords.current.lng, diameter / 2);
        cam.fitBounds(b.ne, b.sw, [40, 40, 40, 40], 800);
      }
      setZoomDiameter(diameter);
    },
    [],
  );

  // Nav icon: first tap gets location + zooms to 20 mi,
  // subsequent taps cycle through NAV_CYCLE (20 → 50 → 100 → US → 20 …)
  const handleNavPress = useCallback(async () => {
    if (!userCoords.current) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        userCoords.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch {
        return;
      }
      setNavCycleIdx(0);
      applyZoom(NAV_CYCLE[0]);
      return;
    }
    const nextIdx = navCycleIdx < 0 ? 0 : (navCycleIdx + 1) % NAV_CYCLE.length;
    setNavCycleIdx(nextIdx);
    applyZoom(NAV_CYCLE[nextIdx]);
  }, [applyZoom, navCycleIdx]);

  // +/- handlers: freeform 5-mile steps
  const handleZoomIn = useCallback(() => {
    if (zoomDiameter === 0) { applyZoom(MAX_DIAMETER); return; }
    if (zoomDiameter <= MIN_DIAMETER) return;
    applyZoom(Math.max(MIN_DIAMETER, zoomDiameter - ZOOM_STEP));
  }, [zoomDiameter, applyZoom]);

  const handleZoomOut = useCallback(() => {
    if (zoomDiameter === 0) return;
    const next = zoomDiameter + ZOOM_STEP;
    applyZoom(next > MAX_DIAMETER ? 0 : next);
  }, [zoomDiameter, applyZoom]);

  // Long press on any zoom control opens the radius picker
  const handleLongPress = useCallback(() => setPickerVisible(true), []);
  const handlePickerSelect = useCallback(
    (miles: number) => { setPickerVisible(false); applyZoom(miles); },
    [applyZoom],
  );

  // Set default project zoom (persisted across sessions)
  const handleSetDefault = useCallback(async (miles: number) => {
    setDefaultZoom(miles);
    defaultZoomRef.current = miles;
    await setDefaultProjectZoom(miles);
  }, []);

  // Derived disabled states
  const canZoomIn = zoomDiameter === 0 || zoomDiameter > MIN_DIAMETER;
  const canZoomOut = zoomDiameter !== 0;

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
        {/* Default: national US view — camera moves via useEffect */}
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: US_CENTER,
            zoomLevel: US_ZOOM,
          }}
          animationDuration={600}
        />

        {/* Current location puck */}
        <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

        {/* Geofence circles */}
        {showGeofences && visibleProjects.map((p) => (
          <GeofenceCircle
            key={`gf-${p.id}`}
            id={p.id}
            longitude={p.longitude!}
            latitude={p.latitude!}
            isInside={clockedInProjectIds?.has(p.id)}
          />
        ))}

        {/* Project pins */}
        {visibleProjects.map((p) => (
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
        {showCrew && crew && crew.length > 0 && (
          <CrewDots crew={crew} currentUserId={currentUserId} />
        )}
      </Mapbox.MapView>

      {/* Legend (draggable, toggleable layers) */}
      <RNAnimated.View style={[styles.legendCard, { transform: legendPan.getTranslateTransform() }]}>
        <View {...legendPanResponder.panHandlers} style={styles.legendHeader}>
          <Text style={styles.legendDragHandle}>≡</Text>
          <Text style={styles.scaleText}>Legend</Text>
          <Text style={styles.legendChevron}>{legendOpen ? "▾" : "▸"}</Text>
        </View>
        {legendOpen && (
          <View style={styles.legendBody}>
            <Pressable onPress={() => toggleSection(PROJECT_LEGEND.map((l) => l.key))}>
              <Text style={styles.legendSection}>Projects</Text>
            </Pressable>
            {PROJECT_LEGEND.map((item) => {
              const on = isLayerOn(item.key);
              return (
                <Pressable key={item.key} style={styles.legendRow} onPress={() => toggleLayer(item.key)}>
                  <View style={[styles.legendDot, { backgroundColor: on ? item.color : "transparent", borderWidth: 1.5, borderColor: item.color }]} />
                  <Text style={[styles.legendLabel, !on && styles.legendLabelOff]}>{item.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => toggleSection(SUPPLIER_LEGEND.map((l) => l.key))}>
              <Text style={styles.legendSection}>Suppliers</Text>
            </Pressable>
            {SUPPLIER_LEGEND.map((item) => {
              const on = isLayerOn(item.key);
              return (
                <Pressable key={item.key} style={styles.legendRow} onPress={() => toggleLayer(item.key)}>
                  <View style={[styles.legendDot, { backgroundColor: on ? item.color : "transparent", borderWidth: 1.5, borderColor: item.color }]} />
                  <Text style={[styles.legendLabel, !on && styles.legendLabelOff]}>{item.label}</Text>
                </Pressable>
              );
            })}
            <View style={styles.legendSeparator} />
            {EXTRA_LAYERS.map((item) => {
              const on = isLayerOn(item.key);
              return (
                <Pressable key={item.key} style={styles.legendRow} onPress={() => toggleLayer(item.key)}>
                  <View style={[styles.legendDot, { backgroundColor: on ? item.color : "transparent", borderWidth: 1.5, borderColor: item.color }]} />
                  <Text style={[styles.legendLabel, !on && styles.legendLabelOff]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </RNAnimated.View>
    </View>
  );
});

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
  controlColumn: {
    position: "absolute",
    top: 12,
    right: 12,
    alignItems: "center",
    gap: 4,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  controlBtnDark: {
    backgroundColor: colors.primary,
  },
  controlBtnDisabled: {
    backgroundColor: "#94a3b8",
    opacity: 0.5,
  },
  controlBtnDarkText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "800",
    lineHeight: 22,
  },
  controlBtnDisabledText: {
    color: "#cbd5e1",
  },
  navIcon: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700",
  },
  radiusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    textAlign: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },

  // Legend card (bottom-left, collapsible)
  legendCard: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    maxWidth: 160,
  },
  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  scaleBar: {
    width: 24,
    height: 2,
    backgroundColor: "#374151",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#374151",
  },
  scaleText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#374151",
    flex: 1,
  },
  legendChevron: {
    fontSize: 9,
    color: "#6b7280",
  },
  legendBody: {
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d1d5db",
  },
  legendSection: {
    fontSize: 8,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 5,
    marginBottom: 2,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 9,
    color: "#374151",
  },
  legendDragHandle: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 13,
  },
  legendLabelOff: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  legendSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#d1d5db",
    marginVertical: 3,
  },

  // Radius picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    width: 200,
    maxHeight: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  pickerHint: {
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  pickerScroll: {
    maxHeight: 360,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  pickerRowActive: {
    backgroundColor: colors.primary + "15",
  },
  pickerRowText: {
    fontSize: 14,
    color: "#374151",
    textAlign: "center",
  },
  pickerRowTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  pickerDefaultIcon: {
    fontSize: 16,
    color: "#d1d5db",
    marginLeft: 8,
  },
  pickerDefaultIconActive: {
    color: "#f59e0b",
  },
  pickerDefaultHint: {
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  pickerNoDefaultHint: {
    color: "#f59e0b",
    fontWeight: "600",
    fontSize: 10,
  },
});
