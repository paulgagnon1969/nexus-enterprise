import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";
import { VjnReviewSheet, type VjnData } from "../components/VjnReviewSheet";

// ── Types ──────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "DRAFT" | "SHARED" | "ARCHIVED";

interface Props {
  onBack: () => void;
  /** Optional project filter */
  projectId?: string;
  projectName?: string;
}

// ── Status config ──────────────────────────────────────────────────

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: string }[] = [
  { key: "ALL", label: "All", icon: "📋" },
  { key: "DRAFT", label: "Draft", icon: "✏️" },
  { key: "SHARED", label: "Shared", icon: "📤" },
  { key: "ARCHIVED", label: "Archived", icon: "🗄️" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#fef3c7", text: "#92400e" },
  SHARED: { bg: "#d1fae5", text: "#065f46" },
  ARCHIVED: { bg: "#e5e7eb", text: "#6b7280" },
};

// ── Component ──────────────────────────────────────────────────────

export function VjnListScreen({ onBack, projectId, projectName }: Props) {
  const [vjns, setVjns] = useState<VjnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedVjn, setSelectedVjn] = useState<VjnData | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);

  // ── Load VJNs ──────────────────────────────────────────────────

  const loadVjns = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (projectId) params.set("projectId", projectId);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        const qs = params.toString();

        const data = await apiJson<VjnData[]>(`/vjn${qs ? `?${qs}` : ""}`);
        setVjns(data);
      } catch (err) {
        console.error("[VjnList] Load failed:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, statusFilter],
  );

  useEffect(() => {
    void loadVjns();
  }, [loadVjns]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadVjns(true);
  }, [loadVjns]);

  // ── Open review sheet ──────────────────────────────────────────

  const openReview = useCallback((vjn: VjnData) => {
    void Haptics.selectionAsync();
    setSelectedVjn(vjn);
    setReviewVisible(true);
  }, []);

  const closeReview = useCallback(() => {
    setReviewVisible(false);
    setSelectedVjn(null);
  }, []);

  const handleShared = useCallback(() => {
    closeReview();
    void loadVjns(true);
  }, [closeReview, loadVjns]);

  // ── Helpers ────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render item ────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: VjnData }) => {
      const statusStyle = STATUS_COLORS[item.status] ?? STATUS_COLORS.DRAFT;
      const preview = item.aiSummary ?? item.aiText ?? item.deviceTranscript ?? "No transcript";
      const langLabel = item.language?.toUpperCase() ?? "EN";

      return (
        <Pressable style={styles.card} onPress={() => openReview(item)}>
          <View style={styles.cardHeader}>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTime}>{formatDate(item.createdAt)}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {item.status}
                </Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardDuration}>
                🎙️ {formatDuration(item.voiceDurationSecs)}
              </Text>
              {langLabel !== "EN" && (
                <Text style={styles.cardLang}>{langLabel}</Text>
              )}
            </View>
          </View>

          {item.project && (
            <Text style={styles.cardProject}>{item.project.name}</Text>
          )}

          <Text style={styles.cardPreview} numberOfLines={2}>
            {preview}
          </Text>

          {item.shares && item.shares.length > 0 && (
            <View style={styles.sharesRow}>
              {item.shares.map((s) => (
                <View key={s.id} style={styles.shareChip}>
                  <Text style={styles.shareChipText}>
                    {s.targetModule === "daily_log" ? "📋" : s.targetModule === "journal" ? "📓" : "💬"}{" "}
                    {s.targetModule.replace("_", " ")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      );
    },
    [openReview],
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>🎙️ My VJNs</Text>
          {projectName && (
            <Text style={styles.subtitle}>{projectName}</Text>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              statusFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={styles.filterIcon}>{f.icon}</Text>
            <Text
              style={[
                styles.filterLabel,
                statusFilter === f.key && styles.filterLabelActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : (
        <FlatList
          data={vjns}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎙️</Text>
              <Text style={styles.emptyTitle}>No Voice Journal Notes</Text>
              <Text style={styles.emptySubtitle}>
                Record a VJN from any project or the home screen to see it here.
              </Text>
            </View>
          }
        />
      )}

      {/* Review sheet */}
      <VjnReviewSheet
        visible={reviewVisible}
        vjn={selectedVjn}
        onClose={closeReview}
        onShared={handleShared}
        projectId={projectId}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
    width: 60,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Filters
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterIcon: {
    fontSize: 14,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  filterLabelActive: {
    color: "#fff",
  },

  // List
  listContent: {
    padding: 16,
    gap: 12,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTime: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardDuration: {
    fontSize: 13,
    color: "#6b7280",
  },
  cardLang: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  cardProject: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 6,
  },
  cardPreview: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    marginTop: 6,
  },
  sharesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  shareChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#f0fdf4",
  },
  shareChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065f46",
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
});
