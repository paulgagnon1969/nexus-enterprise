import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { fetchDailyLogFeed, fetchUserProjects, deleteDailyLog } from "../api/dailyLog";
import { getCache, setCache } from "../offline/cache";
import { colors } from "../theme/colors";
import { ProjectPickerModal } from "../components/ProjectPickerModal";
import type { DailyLogListItem, DailyLogType, ProjectListItem } from "../types/api";

interface Props {
  onSelectLog: (log: DailyLogListItem) => void;
  onEditLog?: (log: DailyLogListItem) => void;
  onCreateLog?: () => void;
}

export function DailyLogFeedScreen({ onSelectLog, onEditLog, onCreateLog }: Props) {
  const [logs, setLogs] = useState<DailyLogListItem[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKeyLogs = "dailyLogFeed:all";
  const cacheKeyProjects = "dailyLogFeed:projects";

  // Load cached data on mount
  useEffect(() => {
    (async () => {
      const [cachedLogs, cachedProjects] = await Promise.all([
        getCache<DailyLogListItem[]>(cacheKeyLogs),
        getCache<ProjectListItem[]>(cacheKeyProjects),
      ]);
      if (cachedLogs) setLogs(cachedLogs);
      if (cachedProjects) setProjects(cachedProjects);
    })();
  }, []);

  // Fetch fresh data
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [feedRes, projectsRes] = await Promise.all([
        fetchDailyLogFeed({ limit: 100 }),
        fetchUserProjects(),
      ]);

      setLogs(feedRes.items);
      setProjects(projectsRes);

      await Promise.all([
        setCache(cacheKeyLogs, feedRes.items),
        setCache(cacheKeyProjects, projectsRes),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Compute log counts per project (for popularity sorting in picker)
  const logCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      counts.set(log.projectId, (counts.get(log.projectId) ?? 0) + 1);
    }
    return counts;
  }, [logs]);

  // Filter logs by selected projects
  const filteredLogs = useMemo(() => {
    if (selectedProjectIds.size === 0) {
      return logs;
    }
    return logs.filter((log) => selectedProjectIds.has(log.projectId));
  }, [logs, selectedProjectIds]);

  // Selection summary label for the dropdown banner
  const selectionLabel = useMemo(() => {
    if (selectedProjectIds.size === 0) return "All Projects";
    if (selectedProjectIds.size === 1) {
      const p = projects.find((x) => selectedProjectIds.has(x.id));
      return p?.name || "1 project";
    }
    return `${selectedProjectIds.size} of ${projects.length} projects`;
  }, [selectedProjectIds, projects]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // Check if attachment is an image
  const isImageAttachment = (att: { fileName?: string | null; mimeType?: string | null }) => {
    const fileName = att.fileName?.toLowerCase() || "";
    const mimeType = att.mimeType?.toLowerCase() || "";
    return (
      mimeType.startsWith("image/") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".gif") ||
      fileName.endsWith(".webp")
    );
  };

  // Delete handler with confirmation
  const handleDelete = useCallback(
    (item: DailyLogListItem) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Delete Daily Log",
        `Are you sure you want to delete this daily log${item.title ? `: "${item.title}"` : ""}? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteDailyLog(item.projectId, item.id);
                void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                // Remove from local state immediately
                setLogs((prev) => prev.filter((l) => l.id !== item.id));
              } catch (e) {
                void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error,
                );
                Alert.alert(
                  "Error",
                  e instanceof Error ? e.message : "Failed to delete daily log",
                );
              }
            },
          },
        ],
      );
    },
    [],
  );

  const renderLogItem = ({ item }: { item: DailyLogListItem }) => {
    const createdByName = item.createdByUser
      ? [item.createdByUser.firstName, item.createdByUser.lastName]
          .filter(Boolean)
          .join(" ") || item.createdByUser.email
      : "Unknown";

    // Get image attachments for thumbnails
    const imageAttachments = item.attachments?.filter(isImageAttachment) || [];
    const hasImages = imageAttachments.length > 0;

    return (
      <View style={styles.card}>
        <Pressable onPress={() => onSelectLog(item)}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.cardDate}>{formatDate(item.logDate)}</Text>
              {item.type && item.type !== "PUDL" && (
                <View style={[styles.typeBadge, getTypeBadgeStyle(item.type)]}>
                  <Text style={styles.typeBadgeText}>{getTypeLabel(item.type)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardProject}>{item.projectName}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || "(No title)"}
          </Text>
          {item.workPerformed ? (
            <Text style={styles.cardSnippet} numberOfLines={2}>
              {item.workPerformed}
            </Text>
          ) : null}

          {/* Photo thumbnails */}
          {hasImages && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbnailRow}
              contentContainerStyle={styles.thumbnailRowContent}
            >
              {imageAttachments.slice(0, 4).map((att, idx) => {
                const imageUri = att.fileUrl || att.thumbnailUrl;
                // Skip non-HTTP URLs (legacy gs:// GCP references)
                if (!imageUri || !imageUri.startsWith("http")) return null;
                return (
                  <Image
                    key={att.id || idx}
                    source={{ uri: imageUri }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                );
              })}
              {imageAttachments.length > 4 && (
                <View style={styles.thumbnailMore}>
                  <Text style={styles.thumbnailMoreText}>+{imageAttachments.length - 4}</Text>
                </View>
              )}
            </ScrollView>
          )}

          <View style={styles.cardFooter}>
            <Text style={styles.cardMeta}>By {createdByName}</Text>
            {item.attachments && item.attachments.length > 0 && (
              <Text style={styles.cardMeta}>
                📎 {item.attachments.length}
              </Text>
            )}
          </View>
        </Pressable>

        {/* Action buttons row */}
        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              onSelectLog(item);
            }}
          >
            <Text style={styles.actionBtnIcon}>👁</Text>
            <Text style={styles.actionBtnLabel}>View</Text>
          </Pressable>
          {onEditLog && (
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                void Haptics.selectionAsync();
                onEditLog(item);
              }}
            >
              <Text style={styles.actionBtnIcon}>✏️</Text>
              <Text style={styles.actionBtnLabel}>Edit</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.actionBtnIcon}>🗑</Text>
            <Text style={[styles.actionBtnLabel, styles.actionBtnLabelDanger]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Logs</Text>
      </View>

      {/* + Daily Log button — styled like Home page + New Project */}
      {onCreateLog && (
        <View style={styles.createBtnWrap}>
          <Pressable
            style={styles.createBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreateLog();
            }}
          >
            <Text style={styles.createBtnIcon}>＋</Text>
            <Text style={styles.createBtnText}>Daily Log</Text>
          </Pressable>
        </View>
      )}

      {/* Project filter dropdown banner */}
      {projects.length > 0 && (
        <Pressable
          style={styles.filterBanner}
          onPress={() => {
            void Haptics.selectionAsync();
            setShowPicker(true);
          }}
        >
          <View style={styles.filterBannerLeft}>
            <Text style={styles.filterBannerIcon}>📂</Text>
            <View>
              <Text style={styles.filterBannerLabel}>{selectionLabel}</Text>
              {selectedProjectIds.size > 0 && (
                <Text style={styles.filterBannerHint}>
                  Tap to change filter
                </Text>
              )}
            </View>
          </View>
          <Text style={styles.filterBannerChevron}>▾</Text>
        </Pressable>
      )}

      {/* Project picker modal */}
      <ProjectPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        projects={projects}
        selectedIds={selectedProjectIds}
        onSelectionChange={setSelectedProjectIds}
        logCounts={logCountByProject}
      />

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {loading ? "Loading..." : "No daily logs found"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
  },
  // + Daily Log button (matches Home page + New Project style)
  createBtnWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed" as any,
    gap: 6,
  },
  createBtnIcon: {
    fontSize: 18,
    fontWeight: "700" as any,
    color: "#2563eb",
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: "600" as any,
    color: "#2563eb",
  },
  // Action row per card
  actionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: 10,
    paddingTop: 8,
    gap: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.backgroundSecondary,
    gap: 4,
  },
  actionBtnDanger: {
    backgroundColor: "#fef2f2",
  },
  actionBtnIcon: {
    fontSize: 14,
  },
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: "600" as any,
    color: colors.textSecondary,
  },
  actionBtnLabelDanger: {
    color: "#dc2626",
  },
  // Dropdown filter banner
  filterBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
  },
  filterBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  filterBannerIcon: {
    fontSize: 18,
  },
  filterBannerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  filterBannerHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  filterBannerChevron: {
    fontSize: 16,
    color: colors.textMuted,
    marginLeft: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  cardProject: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSnippet: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  cardMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: colors.error,
    marginBottom: 12,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: colors.buttonPrimary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.buttonPrimaryText,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  // Thumbnail styles
  thumbnailRow: {
    marginTop: 10,
    marginBottom: 4,
  },
  thumbnailRowContent: {
    gap: 8,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.borderMuted,
  },
  thumbnailMore: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
});

function getTypeLabel(type?: DailyLogType): string {
  switch (type) {
    case "RECEIPT_EXPENSE": return "Receipt / Expense";
    case "JSA": return "Job Safety Assessment";
    case "INCIDENT": return "Incident Report";
    case "QUALITY": return "Quality Inspection";
    default: return "";
  }
}

function getTypeBadgeStyle(type?: DailyLogType) {
  switch (type) {
    case "RECEIPT_EXPENSE": return { backgroundColor: "#fef3c7" } as const;
    case "JSA": return { backgroundColor: "#dbeafe" } as const;
    case "INCIDENT": return { backgroundColor: "#fee2e2" } as const;
    case "QUALITY": return { backgroundColor: "#d1fae5" } as const;
    default: return { backgroundColor: "#e5e7eb" } as const;
  }
}
