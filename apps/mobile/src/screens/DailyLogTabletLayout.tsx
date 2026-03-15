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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchDailyLogFeed, fetchUserProjects, deleteDailyLog } from "../api/dailyLog";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { setLastProject } from "../storage/settings";
import { colors } from "../theme/colors";
import { DailyLogsScreen } from "./DailyLogsScreen";
import { DailyLogDetailScreen } from "./DailyLogDetailScreen";
import type { DailyLogListItem, ProjectListItem } from "../types/api";
import type { PetlSessionChanges } from "./FieldPetlScreen";

interface Props {
  /** From home project filter context */
  filteredProject?: ProjectListItem | null;
  /** Last-used project from persistent storage */
  lastProject?: ProjectListItem | null;
  /** Company name for breadcrumb in create form */
  companyName?: string;
  /** Navigation callbacks — forwarded from stack wrapper */
  onOpenPetl?: (project: ProjectListItem) => void;
  onOpenPlanSheets?: (project: ProjectListItem) => void;
  onOpenRoomScan?: (project: ProjectListItem) => void;
  onOpenReceiptCapture?: (project: ProjectListItem) => void;
  onOpenSelections?: (project: ProjectListItem) => void;
  onOpenShoppingList?: (project: ProjectListItem) => void;
  userRole?: string;
  onStartCall?: (project: ProjectListItem) => void;
  onEditLog?: (log: DailyLogListItem) => void;
  onProjectChange?: (project: ProjectListItem | null) => void;
  /** Pass PETL changes back to the create form when returning from FieldPetl */
  petlChanges?: PetlSessionChanges;
}

const CACHE_KEY = "dailyLogFeed:all";

export function DailyLogTabletLayout({
  filteredProject,
  lastProject,
  companyName,
  onOpenPetl,
  onOpenPlanSheets,
  onOpenRoomScan,
  onOpenReceiptCapture,
  onOpenSelections,
  onOpenShoppingList,
  userRole,
  onStartCall,
  onEditLog,
  onProjectChange,
  petlChanges,
}: Props) {
  const insets = useSafeAreaInsets();
  const activeProject = filteredProject ?? lastProject ?? null;

  // ── Data ───────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<DailyLogListItem[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // ── Right-pane state ───────────────────────────────────────────────────
  const [selectedLog, setSelectedLog] = useState<DailyLogListItem | null>(null);

  // Load cache
  useEffect(() => {
    (async () => {
      const cached = await getCache<DailyLogListItem[]>(CACHE_KEY);
      if (cached) setLogs(cached);
    })();
  }, []);

  // Fetch fresh data
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [res, projectsRes] = await Promise.all([
        fetchDailyLogFeed({ limit: 100 }),
        fetchUserProjects().catch(() => [] as ProjectListItem[]),
      ]);
      setLogs(res.items);
      setProjects(projectsRes);
      await setCache(CACHE_KEY, res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filter logs by active project
  const displayLogs = useMemo(() => {
    if (!activeProject) return logs;
    return logs.filter((l) => l.projectId === activeProject.id);
  }, [logs, activeProject]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleProjectSelect = useCallback(
    (project: ProjectListItem | null) => {
      onProjectChange?.(project);
      void setLastProject(project ? { id: project.id, name: project.name } : null);
      setSelectedLog(null); // Reset right pane to create form
    },
    [onProjectChange],
  );

  const handleSelectLog = useCallback((log: DailyLogListItem) => {
    void Haptics.selectionAsync();
    setSelectedLog(log);
  }, []);

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
              // If we deleted the currently selected log, return to create form
              if (selectedLog?.id === item.id) setSelectedLog(null);
            } catch (e) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            }
          },
        },
      ],
    );
  }, [selectedLog]);

  const handleLogCreated = useCallback(() => {
    void loadData(); // Refresh the list
  }, [loadData]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ── Render list item ──────────────────────────────────────────────────
  const renderItem = ({ item }: { item: DailyLogListItem }) => {
    const isActive = selectedLog?.id === item.id;
    return (
      <Pressable
        style={[s.row, isActive && s.rowActive]}
        onPress={() => handleSelectLog(item)}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Alert.alert(
            item.title || "Daily Log",
            item.projectName,
            [
              { text: "View", onPress: () => handleSelectLog(item) },
              ...(onEditLog ? [{ text: "Edit", onPress: () => onEditLog(item) }] : []),
              { text: "Delete", style: "destructive" as const, onPress: () => handleDelete(item) },
              { text: "Cancel", style: "cancel" as const },
            ],
          );
        }}
      >
        <View style={s.rowLeft}>
          <Text style={s.rowDate}>{formatDate(item.logDate)}</Text>
          {item.type && item.type !== "PUDL" && (
            <Text style={s.rowType}>
              {item.type === "RECEIPT_EXPENSE" ? "🧾" : item.type === "JSA" ? "⚠️" : item.type === "INCIDENT" ? "🚨" : "🔍"}
            </Text>
          )}
        </View>
        <View style={s.rowCenter}>
          {!activeProject && (
            <Text style={s.rowProject} numberOfLines={1}>
              {item.projectName}
            </Text>
          )}
          <Text style={s.rowTitle} numberOfLines={1}>
            {item.workPerformed || item.title || "Daily log"}
          </Text>
        </View>
        <Text style={s.rowChevron}>›</Text>
      </Pressable>
    );
  };

  // ── Layout ─────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── LEFT PANE: project filter + log list ── */}
      <View style={s.leftPane}>
        {/* Project filter header */}
        <View style={s.listHeader}>
          <Pressable
            style={[s.projectDropdown, activeProject && s.projectDropdownActive]}
            onPress={() => {
              void Haptics.selectionAsync();
              setShowProjectPicker(true);
            }}
          >
            <Text
              style={[s.projectDropdownText, activeProject && s.projectDropdownTextActive]}
              numberOfLines={1}
            >
              {activeProject ? activeProject.name : "All Projects"}
            </Text>
            <Text style={s.dropdownChevron}>▾</Text>
          </Pressable>

          {/* New Log button — returns right pane to create form */}
          <Pressable
            style={[s.newLogBtn, !selectedLog && s.newLogBtnActive]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSelectedLog(null);
            }}
          >
            <Text style={s.newLogBtnText}>＋ New</Text>
          </Pressable>
        </View>

        {/* Project picker overlay */}
        {showProjectPicker && (
          <View style={s.pickerOverlay}>
            <Pressable style={s.pickerBackdrop} onPress={() => setShowProjectPicker(false)} />
            <View style={s.pickerSheet}>
              <Text style={s.pickerTitle}>Select Project</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                <Pressable
                  style={[s.pickerRow, !activeProject && s.pickerRowActive]}
                  onPress={() => {
                    handleProjectSelect(null);
                    setShowProjectPicker(false);
                  }}
                >
                  <Text style={[s.pickerRowText, !activeProject && s.pickerRowTextActive]}>📂 All Projects</Text>
                  {!activeProject && <Text style={s.pickerCheck}>✓</Text>}
                </Pressable>
                {projects
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => {
                    const isActive = activeProject?.id === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[s.pickerRow, isActive && s.pickerRowActive]}
                        onPress={() => {
                          handleProjectSelect(p);
                          setShowProjectPicker(false);
                        }}
                      >
                        <Text
                          style={[s.pickerRowText, isActive && s.pickerRowTextActive]}
                          numberOfLines={1}
                        >
                          📋 {p.name}
                        </Text>
                        {isActive && <Text style={s.pickerCheck}>✓</Text>}
                      </Pressable>
                    );
                  })}
              </ScrollView>
              <Pressable style={s.pickerCloseBtn} onPress={() => setShowProjectPicker(false)}>
                <Text style={s.pickerCloseBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Log list */}
        {error ? (
          <View style={s.errorWrap}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable style={s.retryBtn} onPress={() => loadData()}>
              <Text style={s.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={displayLogs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>
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

      {/* ── Divider ── */}
      <View style={s.divider} />

      {/* ── RIGHT PANE: create form or detail ── */}
      <View style={s.rightPane}>
        {/* Right pane header */}
        <View style={s.rightHeader}>
          {selectedLog ? (
            <>
              <Pressable
                style={s.rightHeaderBack}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSelectedLog(null);
                }}
              >
                <Text style={s.rightHeaderBackText}>← New Log</Text>
              </Pressable>
              <Text style={s.rightHeaderTitle} numberOfLines={1}>
                {selectedLog.title || selectedLog.workPerformed || "Daily Log"}
              </Text>
            </>
          ) : (
            <>
              <Text style={s.rightHeaderTitle}>
                {activeProject ? "New Daily Log" : "Daily Logs"}
              </Text>
            </>
          )}
        </View>

        {/* Right pane content */}
        {selectedLog ? (
          <DailyLogDetailScreen
            log={selectedLog}
            onBack={() => setSelectedLog(null)}
            onEdit={onEditLog ? (detail) => onEditLog(detail as any) : undefined}
            embedded
          />
        ) : activeProject ? (
          <DailyLogsScreen
            project={activeProject}
            companyName={companyName}
            onBack={() => {}}
            onOpenPetl={onOpenPetl ? () => onOpenPetl(activeProject) : undefined}
            onOpenPlanSheets={onOpenPlanSheets ? () => onOpenPlanSheets(activeProject) : undefined}
            onOpenRoomScan={onOpenRoomScan ? () => onOpenRoomScan(activeProject) : undefined}
            onOpenReceiptCapture={onOpenReceiptCapture ? () => onOpenReceiptCapture(activeProject) : undefined}
            onOpenSelections={onOpenSelections ? () => onOpenSelections(activeProject) : undefined}
            onOpenShoppingList={onOpenShoppingList ? () => onOpenShoppingList(activeProject) : undefined}
            userRole={userRole}
            onStartCall={onStartCall ? () => onStartCall(activeProject) : undefined}
            petlChanges={petlChanges}
            embedded
            onLogCreated={handleLogCreated}
          />
        ) : (
          <View style={s.placeholder}>
            <Text style={s.placeholderIcon}>📋</Text>
            <Text style={s.placeholderTitle}>Select a Project</Text>
            <Text style={s.placeholderHint}>
              Choose a project from the dropdown to start creating daily logs.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.backgroundSecondary,
  },

  // ── Left pane (log list) ──────────────────────────────────────────────
  leftPane: {
    width: "35%",
    backgroundColor: colors.backgroundSecondary,
    borderRightWidth: 0,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
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
  newLogBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  newLogBtnActive: {
    backgroundColor: colors.success,
  },
  newLogBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 20,
  },

  // ── Picker ────────────────────────────────────────────────────────────
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

  // ── List rows ─────────────────────────────────────────────────────────
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
  rowActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
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

  // ── Divider ───────────────────────────────────────────────────────────
  divider: {
    width: 1,
    backgroundColor: colors.borderMuted,
  },

  // ── Right pane ────────────────────────────────────────────────────────
  rightPane: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    gap: 10,
  },
  rightHeaderBack: {
    paddingVertical: 2,
    paddingRight: 4,
  },
  rightHeaderBackText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  rightHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },

  // ── Placeholder ───────────────────────────────────────────────────────
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  placeholderHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Error / Empty ─────────────────────────────────────────────────────
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
