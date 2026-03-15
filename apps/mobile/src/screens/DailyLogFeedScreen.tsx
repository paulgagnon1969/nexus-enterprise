import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { fetchDailyLogFeed, fetchUserProjects, deleteDailyLog } from "../api/dailyLog";
import { getCache, setCache } from "../offline/cache";
import { setLastProject } from "../storage/settings";
import { colors } from "../theme/colors";
import type { DailyLogListItem, ProjectListItem } from "../types/api";

interface Props {
  onSelectLog: (log: DailyLogListItem) => void;
  onEditLog?: (log: DailyLogListItem) => void;
  onCreateLog?: (activeProject: ProjectListItem | null) => void;
  /** Pre-selected project from home screen filter context */
  filteredProject?: ProjectListItem | null;
  /** Last project from persistent storage (fallback when no explicit filter) */
  lastProject?: ProjectListItem | null;
  /** Callback when user changes project in this screen's dropdown */
  onProjectChange?: (project: ProjectListItem | null) => void;
}

export function DailyLogFeedScreen({
  onSelectLog,
  onEditLog,
  onCreateLog,
  filteredProject,
  lastProject,
  onProjectChange,
}: Props) {
  // Effective filter: explicit context > last project from storage
  const activeProject = filteredProject ?? lastProject ?? null;

  const [logs, setLogs] = useState<DailyLogListItem[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const cacheKey = "dailyLogFeed:all";

  // Fetch projects on mount — only active/open projects for the picker
  const loadProjects = useCallback(async () => {
    try {
      const all = await fetchUserProjects().catch(() => [] as ProjectListItem[]);
      // Filter to active projects (status is lowercase "active" by default)
      const active = all.filter(
        (p) => !p.status || p.status.toLowerCase() === "active" || p.status.toLowerCase() === "open",
      );
      setProjects(active);
    } catch {}
  }, []);

  // Fetch fresh logs
  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchDailyLogFeed({ limit: 100 });
      setLogs(res.items);
      await setCache(cacheKey, res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load projects + logs on mount
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  // Filter by active project (explicit filter or last-used fallback)
  const displayLogs = useMemo(() => {
    if (!activeProject) return logs;
    return logs.filter((l) => l.projectId === activeProject.id);
  }, [logs, activeProject]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Delete with confirmation
  const handleDelete = useCallback((item: DailyLogListItem) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Delete Daily Log",
      `Delete this log${item.title ? `: "${item.title}"` : ""}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDailyLog(item.projectId, item.id);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setLogs((prev) => prev.filter((l) => l.id !== item.id));
            } catch (e) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            }
          },
        },
      ],
    );
  }, []);

  const handleProjectSelect = useCallback(
    (project: ProjectListItem | null) => {
      onProjectChange?.(project);
      // Persist to AsyncStorage so it survives logout/restart
      void setLastProject(project ? { id: project.id, name: project.name } : null);
    },
    [onProjectChange],
  );

  const renderItem = ({ item }: { item: DailyLogListItem }) => (
    <Pressable
      style={styles.row}
      onPress={() => {
        void Haptics.selectionAsync();
        onSelectLog(item);
      }}
      onLongPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
          item.title || "Daily Log",
          item.projectName,
          [
            { text: "View", onPress: () => onSelectLog(item) },
            ...(onEditLog ? [{ text: "Edit", onPress: () => onEditLog(item) }] : []),
            { text: "Delete", style: "destructive" as const, onPress: () => handleDelete(item) },
            { text: "Cancel", style: "cancel" as const },
          ],
        );
      }}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowDate}>{formatDate(item.logDate)}</Text>
        {item.type && item.type !== "PUDL" && (
          <Text style={styles.rowType}>
            {item.type === "RECEIPT_EXPENSE"
              ? "🧂"
              : item.type === "JSA"
                ? "⚠️"
                : item.type === "INCIDENT"
                  ? "🚨"
                  : "🔍"}
          </Text>
        )}
      </View>
      <View style={styles.rowCenter}>
        {!activeProject && (
          <Text style={styles.rowProject} numberOfLines={1}>
            {item.projectName}
          </Text>
        )}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.workPerformed || item.title || "Daily log"}
        </Text>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Header: project dropdown + narrow "+" */}
      <View style={styles.header}>
        <Pressable
          style={[styles.projectDropdown, activeProject && styles.projectDropdownActive]}
          onPress={() => {
            void Haptics.selectionAsync();
            setShowProjectPicker(true);
          }}
        >
          <Text
            style={[styles.projectDropdownText, activeProject && styles.projectDropdownTextActive]}
            numberOfLines={1}
          >
            {activeProject ? activeProject.name : "All Projects"}
          </Text>
          <Text style={styles.dropdownChevron}>▾</Text>
        </Pressable>
        {onCreateLog && (
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreateLog(activeProject);
            }}
          >
            <Text style={styles.addBtnText}>＋</Text>
          </Pressable>
        )}
      </View>

      {/* Project picker */}
      {showProjectPicker && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowProjectPicker(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Project</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Pressable
                style={[styles.pickerRow, !activeProject && styles.pickerRowActive]}
                onPress={() => {
                  handleProjectSelect(null);
                  setShowProjectPicker(false);
                }}
              >
                <Text style={[styles.pickerRowText, !activeProject && styles.pickerRowTextActive]}>
                  📂 All Projects
                </Text>
                {!activeProject && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>
              {projects
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => {
                  const isActive = activeProject?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.pickerRow, isActive && styles.pickerRowActive]}
                      onPress={() => {
                        handleProjectSelect(p);
                        setShowProjectPicker(false);
                      }}
                    >
                      <Text
                        style={[styles.pickerRowText, isActive && styles.pickerRowTextActive]}
                        numberOfLines={1}
                      >
                        📋 {p.name}
                      </Text>
                      {isActive && <Text style={styles.pickerCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
            </ScrollView>
            <Pressable
              style={styles.pickerCloseBtn}
              onPress={() => setShowProjectPicker(false)}
            >
              <Text style={styles.pickerCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Daily Logs list — always visible */}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadLogs()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayLogs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {loading
                  ? "Loading..."
                  : activeProject
                    ? `No logs for ${activeProject.name}`
                    : "No daily logs found"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  projectDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    gap: 4,
  },
  projectDropdownActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  projectDropdownText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    flex: 1,
  },
  projectDropdownTextActive: {
    fontWeight: "700",
  },
  dropdownChevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  addBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  // ── Picker ──────────────────────────────────────────────────────────────
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
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerRowActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  pickerRowText: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  pickerRowTextActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  pickerCheck: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rowLeft: {
    width: 40,
    alignItems: "center",
  },
  rowDate: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  rowType: { fontSize: 10, marginTop: 1 },
  rowCenter: { flex: 1, marginLeft: 8 },
  rowProject: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rowTitle: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 1,
  },
  rowChevron: {
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 6,
  },
  errorWrap: {
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
  retryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 10,
  },
});
