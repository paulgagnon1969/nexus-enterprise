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
} from "react-native";
import { fetchDailyLogFeed, fetchUserProjects } from "../api/dailyLog";
import { getCache, setCache } from "../offline/cache";
import { colors } from "../theme/colors";
import type { DailyLogListItem, ProjectListItem } from "../types/api";

interface Props {
  onSelectLog: (log: DailyLogListItem) => void;
  onCreateLog?: () => void;
}

export function DailyLogFeedScreen({ onSelectLog, onCreateLog }: Props) {
  const [logs, setLogs] = useState<DailyLogListItem[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
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

  // Filter logs by selected projects
  const filteredLogs = useMemo(() => {
    if (selectedProjectIds.size === 0) {
      return logs;
    }
    return logs.filter((log) => selectedProjectIds.has(log.projectId));
  }, [logs, selectedProjectIds]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedProjectIds(new Set());
  };

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
      <Pressable style={styles.card} onPress={() => onSelectLog(item)}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>{formatDate(item.logDate)}</Text>
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
              if (!imageUri) return null;
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
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Logs</Text>
        {onCreateLog && (
          <Pressable style={styles.addButton} onPress={onCreateLog}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        )}
      </View>

      {/* Project filter chips */}
      {projects.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <Pressable
              style={[
                styles.chip,
                selectedProjectIds.size === 0 && styles.chipSelected,
              ]}
              onPress={clearFilters}
            >
              <Text
                style={
                  selectedProjectIds.size === 0
                    ? styles.chipTextSelected
                    : styles.chipText
                }
              >
                All Projects
              </Text>
            </Pressable>
            {projects.map((project) => {
              const selected = selectedProjectIds.has(project.id);
              return (
                <Pressable
                  key={project.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleProject(project.id)}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                    {project.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: {
    color: colors.textOnPrimary,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 28,
  },
  filterSection: {
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.chipBackground,
  },
  chipSelected: {
    backgroundColor: colors.chipBackgroundSelected,
    borderColor: colors.chipBackgroundSelected,
  },
  chipText: {
    fontSize: 13,
    color: colors.chipText,
  },
  chipTextSelected: {
    fontSize: 13,
    color: colors.chipTextSelected,
    fontWeight: "600",
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
