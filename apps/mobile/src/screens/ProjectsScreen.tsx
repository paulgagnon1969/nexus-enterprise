import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache, deleteCache } from "../offline/cache";
import { DirectionsDialog } from "../components/DirectionsDialog";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";

export function ProjectsScreen({
  onBack,
  onOpenProject,
  refreshKey,
}: {
  onBack?: () => void;
  onOpenProject: (project: ProjectListItem) => void;
  refreshKey?: number;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [directionsProject, setDirectionsProject] = useState<ProjectListItem | null>(null);

  const loadCached = async () => {
    const cached = await getCache<ProjectListItem[]>("projects.list");
    if (cached) setProjects(cached);
  };

  const refreshOnline = async () => {
    setStatus("Loading…");
    try {
      const latest = await apiJson<ProjectListItem[]>("/projects");
      setProjects(latest);
      await setCache("projects.list", latest);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadCached().then(refreshOnline);
  }, []);

  // Refresh when tenant changes (refreshKey updates)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      // Clear cached projects and fetch fresh for new tenant
      void deleteCache("projects.list").then(() => {
        setProjects([]);
        refreshOnline();
      });
    }
  }, [refreshKey]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack}>
            <Text style={styles.link}>← Back</Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}
        <Text style={styles.title}>Projects</Text>
        <Pressable onPress={refreshOnline}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <ScrollView style={{ flex: 1 }}>
        {projects.map((p) => {
          const hasLocation = !!(p.latitude && p.longitude) || !!(p.addressLine1 && p.city && p.state);
          const addressDisplay = p.addressLine1
            ? `${p.addressLine1}, ${p.city}, ${p.state}${p.postalCode ? ` ${p.postalCode}` : ""}`
            : null;

          return (
            <View key={p.id} style={styles.card}>
              <Pressable style={styles.cardContent} onPress={() => onOpenProject(p)}>
                <Text style={styles.cardTitle}>{p.name}</Text>
                {addressDisplay && (
                  <Text style={styles.cardAddress} numberOfLines={1}>
                    {addressDisplay}
                  </Text>
                )}
                {p.status && (
                  <Text style={styles.cardStatus}>{p.status}</Text>
                )}
              </Pressable>
              
              {/* Map pin for directions */}
              {hasLocation && (
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => setDirectionsProject(p)}
                >
                  <Text style={styles.mapPinIcon}>📍</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {!projects.length ? <Text style={styles.status}>No projects cached yet.</Text> : null}
      </ScrollView>

      {/* Directions Dialog */}
      <DirectionsDialog
        visible={!!directionsProject}
        onClose={() => setDirectionsProject(null)}
        destination={{
          latitude: directionsProject?.latitude,
          longitude: directionsProject?.longitude,
          address: directionsProject?.addressLine1
            ? `${directionsProject.addressLine1}, ${directionsProject.city}, ${directionsProject.state}${directionsProject.postalCode ? ` ${directionsProject.postalCode}` : ""}`
            : undefined,
          name: directionsProject?.name,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 54 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: colors.primary, fontWeight: "600" },
  status: { color: colors.textSecondary, marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: colors.background,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  cardAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cardStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: "capitalize",
  },
  mapPinButton: {
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  mapPinIcon: {
    fontSize: 24,
  },
});
