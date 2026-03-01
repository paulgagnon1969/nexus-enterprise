import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
  Animated as RNAnimated,
  useWindowDimensions,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { apiJson } from "../api/client";
import { fetchMyKpis, type PersonalKpis } from "../api/analytics";
import { fetchDailyLogFeed } from "../api/dailyLog";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import { getCache, setCache } from "../offline/cache";
import { colors } from "../theme/colors";
import type { ProjectListItem, DailyLogListItem } from "../types/api";

// ─── Haversine distance (miles) ───────────────────────────────────────────────

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GeoJSON builder ──────────────────────────────────────────────────────────

function toNearbyGeoJson(
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
          address: [p.addressLine1, p.city, p.state].filter(Boolean).join(", "),
        },
      })),
  };
}

/** Lightweight type matching @rnmapbox/maps ShapeSource onPress event */
interface MapPressEvent {
  features: Array<GeoJSON.Feature<GeoJSON.Geometry>>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
}

// ─── KPI color helper ─────────────────────────────────────────────────────────

function kpiColor(you: number, avg: number): string {
  if (avg === 0) return "#22c55e"; // no baseline → green
  const ratio = you / avg;
  if (ratio >= 1) return "#22c55e"; // green
  if (ratio >= 0.7) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

// ─── Map pin styles ───────────────────────────────────────────────────────────

const pinStyle: Mapbox.CircleLayerStyle = {
  circleColor: colors.primary,
  circleRadius: 9,
  circleStrokeWidth: 2.5,
  circleStrokeColor: "#ffffff",
};

const pinInnerStyle: Mapbox.CircleLayerStyle = {
  circleColor: "#ffffff",
  circleRadius: 3,
};

// ─── Directions helper ────────────────────────────────────────────────────────

function openDirections(lat: number, lng: number, address?: string | null) {
  const dest = address || `${lat},${lng}`;
  const url =
    Platform.OS === "ios"
      ? `maps://?daddr=${encodeURIComponent(dest)}&dirflg=d`
      : `google.navigation:q=${encodeURIComponent(dest)}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const NEARBY_RADIUS_MILES = 15;

interface Props {
  onOpenProject: (project: ProjectListItem) => void;
  onCreateProject?: () => void;
  onCompanyChange?: (company: { id: string; name: string }) => void;
  companyName?: string | null;
}

export function KpiHomeScreen({ onOpenProject, onCreateProject, onCompanyChange, companyName }: Props) {
  const { width } = useWindowDimensions();
  const isLandscape = width > 600;

  // Data
  const [kpis, setKpis] = useState<PersonalKpis | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<DailyLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Multi-tenant
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [localCompanyName, setLocalCompanyName] = useState<string | null>(companyName ?? null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);

  // Location
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  // Map callout
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const calloutSlide = useRef(new RNAnimated.Value(200)).current;
  const cameraRef = useRef<Mapbox.Camera>(null);

  // ── Load tenant context ────────────────────────────────────────────────────

  const loadCompanies = useCallback(async () => {
    try {
      const me = await getUserMe();
      const list = (me.memberships ?? []).map((m) => ({
        id: m.companyId,
        name: m.company?.name ?? m.companyId,
      }));
      // Deduplicate
      const seen = new Set<string>();
      const unique = list.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setCompanies(unique);

      // Determine current company
      const companyMe = await getUserCompanyMe();
      if (companyMe?.id) {
        setCurrentCompanyId(companyMe.id);
        setLocalCompanyName(companyMe.name ?? null);
        onCompanyChange?.({ id: companyMe.id, name: companyMe.name ?? companyMe.id });
      }
    } catch {
      // Non-fatal — single-tenant users won't need the picker
    }
  }, [onCompanyChange]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadDataInner = useCallback(async () => {
    const [kpiResult, projectsResult, logsResult] = await Promise.allSettled([
      fetchMyKpis("30d").catch(() => null),
      (async () => {
        const cached = await getCache<ProjectListItem[]>("projects.list");
        try {
          const fresh = await apiJson<ProjectListItem[]>("/projects");
          await setCache("projects.list", fresh);
          return fresh;
        } catch {
          return cached ?? [];
        }
      })(),
      fetchDailyLogFeed({ limit: 5 }).catch(() => ({ items: [] as DailyLogListItem[], total: 0, limit: 5, offset: 0 })),
    ]);

    if (kpiResult.status === "fulfilled" && kpiResult.value) setKpis(kpiResult.value);
    if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
    if (logsResult.status === "fulfilled") setRecentLogs(logsResult.value.items);
  }, []);

  const handleSwitchCompany = useCallback(async (companyId: string) => {
    if (companyId === currentCompanyId) {
      setShowCompanyPicker(false);
      return;
    }
    setSwitchingCompanyId(companyId);
    try {
      const res = await apiSwitchCompany(companyId);
      if (res.company) {
        setCurrentCompanyId(res.company.id);
        setLocalCompanyName(res.company.name);
        onCompanyChange?.(res.company);
      }
      setShowCompanyPicker(false);
      // Reload everything for the new tenant
      setLoading(true);
      await loadDataInner();
      setLoading(false);
    } catch {
      // stay on current company
    } finally {
      setSwitchingCompanyId(null);
    }
  }, [currentCompanyId, onCompanyChange, loadDataInner]);

  // Wrapper that also loads companies on first call
  const loadData = useCallback(async () => {
    await Promise.all([loadDataInner(), loadCompanies()]);
  }, [loadDataInner, loadCompanies]);

  const loadLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      // Location unavailable — map will show all projects
    }
  }, []);

  // Track whether we've already attempted an auto-switch so we don't loop.
  const autoSwitchAttempted = useRef(false);

  useEffect(() => {
    (async () => {
      await Promise.all([loadDataInner(), loadCompanies(), loadLocation()]);
      setLoading(false);
    })();
  }, [loadDataInner, loadCompanies, loadLocation]);

  // Auto-switch: if the initial company returned zero projects and the user
  // has other companies available, silently switch to the first real one.
  useEffect(() => {
    if (autoSwitchAttempted.current) return;
    if (loading) return; // wait for initial load
    if (projects.length > 0) return; // current company has data — no switch needed
    if (companies.length <= 1) return; // single tenant — nothing to switch to

    // Find a different company to try (skip current + "Nexus System")
    const alt = companies.find(
      (c) => c.id !== currentCompanyId && c.name !== "Nexus System",
    );
    if (!alt) return;

    autoSwitchAttempted.current = true;
    void handleSwitchCompany(alt.id);
  }, [loading, projects, companies, currentCompanyId, handleSwitchCompany]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDataInner();
    setRefreshing(false);
  }, [loadDataInner]);

  // ── Nearby filtering ──────────────────────────────────────────────────────

  const nearbyProjects = useMemo(() => {
    if (!userLoc) {
      // No location → show all projects that have coords
      return projects.filter((p) => p.latitude != null && p.longitude != null);
    }
    return projects.filter((p) => {
      if (p.latitude == null || p.longitude == null) return false;
      return haversineMiles(userLoc.lat, userLoc.lng, p.latitude, p.longitude) <= NEARBY_RADIUS_MILES;
    });
  }, [projects, userLoc]);

  const geoData = useMemo(() => toNearbyGeoJson(nearbyProjects), [nearbyProjects]);

  const mapBounds = useMemo(() => {
    if (geoData.features.length === 0 && userLoc) {
      // No nearby projects — center on user
      const pad = 0.05;
      return {
        ne: [userLoc.lng + pad, userLoc.lat + pad] as [number, number],
        sw: [userLoc.lng - pad, userLoc.lat - pad] as [number, number],
      };
    }
    if (geoData.features.length === 0) return undefined;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const f of geoData.features) {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // Include user location in bounds
    if (userLoc) {
      if (userLoc.lng < minLng) minLng = userLoc.lng;
      if (userLoc.lng > maxLng) maxLng = userLoc.lng;
      if (userLoc.lat < minLat) minLat = userLoc.lat;
      if (userLoc.lat > maxLat) maxLat = userLoc.lat;
    }
    const lngPad = Math.max((maxLng - minLng) * 0.15, 0.02);
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.02);
    return {
      ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
      sw: [minLng - lngPad, minLat - latPad] as [number, number],
    };
  }, [geoData, userLoc]);

  // ── Pin callout ───────────────────────────────────────────────────────────

  const showCallout = useCallback(
    (project: ProjectListItem) => {
      setSelectedProject(project);
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
    }).start(() => setSelectedProject(null));
  }, [calloutSlide]);

  const handlePinPress = useCallback(
    (e: MapPressEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const pid = feature.properties?.id;
      const proj = nearbyProjects.find((p) => p.id === pid);
      if (proj) showCallout(proj);
    },
    [nearbyProjects, showCallout],
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getAddress = (p: ProjectListItem) =>
    [p.addressLine1, p.city, p.state].filter(Boolean).join(", ");

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  const kpiCards = kpis
    ? [
        { label: "Daily Logs", icon: "📝", ...kpis.modules.dailyLogs },
        { label: "Tasks", icon: "✅", ...kpis.modules.tasks },
        { label: "Messages", icon: "💬", ...kpis.modules.messages },
        { label: "Timecards", icon: "⏱️", ...kpis.modules.timecards },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerTitleRow}
          onPress={companies.length > 1 ? () => setShowCompanyPicker(true) : undefined}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {localCompanyName ?? companyName ?? "Dashboard"}
          </Text>
          {companies.length > 1 && (
            <Text style={styles.headerChevron}>▾</Text>
          )}
        </Pressable>
        {onCreateProject && (
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreateProject();
            }}
          >
            <Text style={styles.addBtnText}>＋ New Project</Text>
          </Pressable>
        )}
      </View>

      {/* Company picker modal */}
      {showCompanyPicker && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowCompanyPicker(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Switch Organization</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {companies.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.pickerRow,
                    c.id === currentCompanyId && styles.pickerRowActive,
                  ]}
                  onPress={() => void handleSwitchCompany(c.id)}
                >
                  <Text
                    style={[
                      styles.pickerRowText,
                      c.id === currentCompanyId && styles.pickerRowTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  {switchingCompanyId === c.id && (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                  {c.id === currentCompanyId && switchingCompanyId !== c.id && (
                    <Text style={styles.pickerCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.pickerCloseBtn}
              onPress={() => setShowCompanyPicker(false)}
            >
              <Text style={styles.pickerCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── KPI Cards ──────────────────────────────────────────────── */}
        {kpis && (
          <>
            <View style={styles.kpiGrid}>
              {kpiCards.map((card) => (
                <View key={card.label} style={styles.kpiCard}>
                  <View style={styles.kpiCardHeader}>
                    <Text style={styles.kpiIcon}>{card.icon}</Text>
                    <Text style={styles.kpiLabel}>{card.label}</Text>
                  </View>
                  <Text style={[styles.kpiYou, { color: kpiColor(card.you, card.companyAvg) }]}>
                    {card.you}
                  </Text>
                  <Text style={styles.kpiAvg}>avg {card.companyAvg}</Text>
                </View>
              ))}
            </View>

            {/* ── Ranking & Completion ────────────────────────────────── */}
            <View style={styles.rankingRow}>
              <View style={[styles.rankingPill, { backgroundColor: kpis.ranking.dailyLogPercentile >= 70 ? "#dcfce7" : kpis.ranking.dailyLogPercentile >= 40 ? "#fef9c3" : "#fee2e2" }]}>
                <Text style={styles.rankingIcon}>🏆</Text>
                <Text style={[styles.rankingText, { color: kpis.ranking.dailyLogPercentile >= 70 ? "#166534" : kpis.ranking.dailyLogPercentile >= 40 ? "#854d0e" : "#991b1b" }]}>
                  {kpis.ranking.label}
                </Text>
              </View>
              <View style={styles.completionBox}>
                <Text style={styles.completionLabel}>Task Completion</Text>
                <Text style={styles.completionValues}>
                  <Text style={{ fontWeight: "800", color: kpiColor(kpis.completionRate.you, kpis.completionRate.companyAvg) }}>
                    {kpis.completionRate.you}%
                  </Text>
                  {" vs "}
                  <Text style={{ color: colors.textMuted }}>{kpis.completionRate.companyAvg}% avg</Text>
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── Nearby Projects Map ────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            📍 Nearby Projects
          </Text>
          <Text style={styles.sectionCount}>
            {nearbyProjects.length} within {NEARBY_RADIUS_MILES} mi
          </Text>
        </View>

        <View style={styles.mapContainer}>
          <Mapbox.MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
            onPress={() => { if (selectedProject) hideCallout(); }}
          >
            <Mapbox.Camera
              ref={cameraRef}
              bounds={mapBounds}
              animationDuration={600}
            />

            <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

            <Mapbox.ShapeSource
              id="nearby-projects"
              shape={geoData}
              onPress={handlePinPress}
            >
              <Mapbox.CircleLayer id="nearby-pin" style={pinStyle} />
              <Mapbox.CircleLayer id="nearby-pin-inner" style={pinInnerStyle} />
            </Mapbox.ShapeSource>
          </Mapbox.MapView>

          {nearbyProjects.length === 0 && (
            <View style={styles.mapEmptyOverlay}>
              <Text style={styles.mapEmptyText}>
                No projects within {NEARBY_RADIUS_MILES} miles
              </Text>
            </View>
          )}

          {/* Pin callout */}
          {selectedProject && (
            <RNAnimated.View
              style={[
                styles.callout,
                { transform: [{ translateY: calloutSlide }] },
              ]}
            >
              <View style={styles.calloutHandle} />
              <Text style={styles.calloutName} numberOfLines={1}>
                {selectedProject.name}
              </Text>
              {getAddress(selectedProject) ? (
                <Text style={styles.calloutAddress} numberOfLines={1}>
                  {getAddress(selectedProject)}
                </Text>
              ) : null}
              <View style={styles.calloutActions}>
                <Pressable
                  style={styles.calloutDirectionsBtn}
                  onPress={() => {
                    if (selectedProject.latitude != null && selectedProject.longitude != null) {
                      openDirections(
                        selectedProject.latitude,
                        selectedProject.longitude,
                        getAddress(selectedProject) || null,
                      );
                    }
                  }}
                >
                  <Text style={styles.calloutDirectionsText}>🧭 Directions</Text>
                </Pressable>
                <Pressable
                  style={styles.calloutOpenBtn}
                  onPress={() => {
                    hideCallout();
                    onOpenProject(selectedProject);
                  }}
                >
                  <Text style={styles.calloutOpenText}>Open Project ›</Text>
                </Pressable>
                <Pressable style={styles.calloutDismissBtn} onPress={hideCallout}>
                  <Text style={styles.calloutDismissText}>✕</Text>
                </Pressable>
              </View>
            </RNAnimated.View>
          )}
        </View>

        {/* ── Recent Activity ────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 Recent Activity</Text>
        </View>

        {recentLogs.length === 0 ? (
          <View style={styles.emptyActivity}>
            <Text style={styles.emptyActivityText}>No recent daily logs</Text>
          </View>
        ) : (
          recentLogs.map((log) => (
            <Pressable
              key={log.id}
              style={styles.activityRow}
              onPress={() => {
                const proj = projects.find((p) => p.id === log.projectId);
                if (proj) {
                  void Haptics.selectionAsync();
                  onOpenProject(proj);
                }
              }}
            >
              <View style={styles.activityLeft}>
                <Text style={styles.activityDate}>{formatDate(log.logDate)}</Text>
                {log.type && log.type !== "PUDL" && (
                  <Text style={styles.activityType}>
                    {log.type === "RECEIPT_EXPENSE" ? "🧾" : log.type === "JSA" ? "⚠️" : log.type === "INCIDENT" ? "🚨" : "🔍"}
                  </Text>
                )}
              </View>
              <View style={styles.activityCenter}>
                <Text style={styles.activityProject} numberOfLines={1}>
                  {log.projectName}
                </Text>
                <Text style={styles.activitySummary} numberOfLines={1}>
                  {log.workPerformed || log.title || "Daily log"}
                </Text>
              </View>
              <Text style={styles.activityChevron}>›</Text>
            </Pressable>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.textMuted },
  scroll: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    flexShrink: 1,
  },
  headerChevron: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 1,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // ── KPI Cards ───────────────────────────────────────────────────────────
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 10,
  },
  kpiCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  kpiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  kpiIcon: { fontSize: 16 },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiYou: {
    fontSize: 28,
    fontWeight: "800",
  },
  kpiAvg: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Ranking ─────────────────────────────────────────────────────────────
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  rankingPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  rankingIcon: { fontSize: 18 },
  rankingText: { fontSize: 14, fontWeight: "700" },
  completionBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  completionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  completionValues: { fontSize: 15 },

  // ── Section headers ─────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  sectionCount: { fontSize: 12, color: colors.textMuted },

  // ── Map ─────────────────────────────────────────────────────────────────
  mapContainer: {
    height: 280,
    marginHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  map: { flex: 1 },
  mapEmptyOverlay: {
    position: "absolute",
    top: "40%",
    left: 24,
    right: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  mapEmptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },

  // ── Pin callout ─────────────────────────────────────────────────────────
  callout: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  calloutHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMuted,
    alignSelf: "center",
    marginBottom: 8,
  },
  calloutName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  calloutAddress: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 10,
  },
  calloutActions: {
    flexDirection: "row",
    gap: 8,
  },
  calloutDirectionsBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  calloutDirectionsText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutOpenBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  calloutOpenText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutDismissBtn: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutDismissText: {
    fontSize: 16,
    color: colors.textMuted,
  },

  // ── Recent Activity ─────────────────────────────────────────────────────
  emptyActivity: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyActivityText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  activityLeft: {
    width: 52,
    alignItems: "center",
  },
  activityDate: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  activityType: { fontSize: 14, marginTop: 2 },
  activityCenter: { flex: 1, marginLeft: 10 },
  activityProject: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  activitySummary: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  activityChevron: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 8,
  },

  // ── Company picker ──────────────────────────────────────────────────────
  pickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: "flex-end",
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerRowActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  pickerRowText: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  pickerRowTextActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  pickerCheck: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700",
    marginLeft: 8,
  },
  pickerCloseBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  pickerCloseBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
