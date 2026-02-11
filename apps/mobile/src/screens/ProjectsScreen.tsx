import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import type { ProjectListItem } from "../types/api";

export function ProjectsScreen({
  onBack,
  onOpenProject,
}: {
  onBack?: () => void;
  onOpenProject: (project: ProjectListItem) => void;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);

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
        {projects.map((p) => (
          <Pressable key={p.id} style={styles.card} onPress={() => onOpenProject(p)}>
            <Text style={styles.cardTitle}>{p.name}</Text>
            <Text style={styles.cardSub}>{p.id}</Text>
          </Pressable>
        ))}
        {!projects.length ? <Text style={styles.status}>No projects cached yet.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 38 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  status: { color: "#374151", marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardSub: { color: "#6b7280", marginTop: 4, fontSize: 12 },
});
