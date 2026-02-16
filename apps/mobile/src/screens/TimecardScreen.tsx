import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import type { ProjectListItem } from "../types/api";
import type {
  ClockStatus,
  RecentTimeEntry,
} from "../api/timecard";

export function TimecardScreen() {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentTimeEntry[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Timer for elapsed time display
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedTime = useMemo(() => {
    if (!status?.isClockedIn || !status.clockedInAt) return null;
    const start = new Date(status.clockedInAt).getTime();
    const diff = Math.max(0, now - start);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [status, now]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load cached data first
      const [cachedStatus, cachedRecent, cachedProjects] = await Promise.all([
        getCache<ClockStatus>("timecard.status"),
        getCache<RecentTimeEntry[]>("timecard.recent"),
        getCache<ProjectListItem[]>("projects.list"),
      ]);

      if (cachedStatus) setStatus(cachedStatus);
      if (cachedRecent) setRecentEntries(cachedRecent);
      if (cachedProjects) setProjects(cachedProjects);

      // Fetch fresh data
      const [freshStatus, freshRecent, freshProjects] = await Promise.all([
        apiJson<ClockStatus>("/timecard/me/status").catch(() => cachedStatus),
        apiJson<RecentTimeEntry[]>("/timecard/me/recent").catch(() => cachedRecent ?? []),
        apiJson<ProjectListItem[]>("/projects").catch(() => cachedProjects ?? []),
      ]);

      if (freshStatus) {
        setStatus(freshStatus);
        await setCache("timecard.status", freshStatus);
      }
      if (freshRecent) {
        setRecentEntries(freshRecent);
        await setCache("timecard.recent", freshRecent);
      }
      if (freshProjects) {
        setProjects(freshProjects);
        await setCache("projects.list", freshProjects);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleClockIn = async () => {
    if (!selectedProjectId) {
      setMessage("Please select a project first");
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      // Try online first
      const result = await apiJson<ClockStatus>("/timecard/me/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
        }),
      });

      setStatus(result);
      await setCache("timecard.status", result);
      setMessage("Clocked in successfully!");
    } catch (e) {
      // Queue offline
      const project = projects.find((p) => p.id === selectedProjectId);
      await enqueueOutbox("timecard.clockIn", {
        projectId: selectedProjectId,
        timestamp: new Date().toISOString(),
      });

      // Optimistic update
      setStatus({
        isClockedIn: true,
        currentEntry: null,
        projectId: selectedProjectId,
        projectName: project?.name ?? selectedProjectId,
        clockedInAt: new Date().toISOString(),
      });

      setMessage("Saved offline. Will sync when connected.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!status?.projectId) return;

    setActionLoading(true);
    setMessage(null);

    try {
      // Try online first
      const result = await apiJson<ClockStatus>("/timecard/me/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: status.projectId,
        }),
      });

      setStatus(result);
      await setCache("timecard.status", result);
      setMessage("Clocked out successfully!");
      
      // Refresh recent entries
      void loadData();
    } catch (e) {
      // Queue offline
      await enqueueOutbox("timecard.clockOut", {
        projectId: status.projectId,
        timestamp: new Date().toISOString(),
        clockedInAt: status.clockedInAt,
      });

      // Optimistic update
      setStatus({
        isClockedIn: false,
        currentEntry: null,
        projectId: null,
        projectName: null,
        clockedInAt: null,
      });

      setMessage("Saved offline. Will sync when connected.");
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  if (loading && !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading timecard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Timecard</Text>
        <Pressable onPress={loadData} disabled={loading}>
          <Text style={[styles.link, loading && styles.linkDisabled]}>
            {loading ? "Loading..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {/* Current Status Card */}
      <View style={[styles.statusCard, status?.isClockedIn && styles.statusCardActive]}>
        {status?.isClockedIn ? (
          <>
            <Text style={styles.statusLabel}>Currently Clocked In</Text>
            <Text style={styles.statusProject}>{status.projectName}</Text>
            <Text style={styles.elapsedTime}>{elapsedTime}</Text>
            <Text style={styles.clockedInAt}>
              Since {formatTime(status.clockedInAt)}
            </Text>

            <Pressable
              style={[styles.clockButton, styles.clockOutButton]}
              onPress={handleClockOut}
              disabled={actionLoading}
            >
              <Text style={styles.clockButtonText}>
                {actionLoading ? "Processing..." : "Clock Out"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.statusLabel}>Not Clocked In</Text>
            <Text style={styles.statusHint}>Select a project to clock in</Text>

            {/* Project Dropdown Selector */}
            <Pressable
              style={styles.projectDropdown}
              onPress={() => setShowProjectPicker(true)}
            >
              <Text
                style={[
                  styles.projectDropdownText,
                  !selectedProjectId && styles.projectDropdownPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selectedProjectId
                  ? projects.find((p) => p.id === selectedProjectId)?.name ?? "Select project"
                  : "Select project..."}
              </Text>
              <Text style={styles.projectDropdownArrow}>▼</Text>
            </Pressable>

            <Pressable
              style={[
                styles.clockButton,
                styles.clockInButton,
                !selectedProjectId && styles.clockButtonDisabled,
              ]}
              onPress={handleClockIn}
              disabled={actionLoading || !selectedProjectId}
            >
              <Text style={styles.clockButtonText}>
                {actionLoading ? "Processing..." : "Clock In"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Recent Entries */}
      <Text style={styles.sectionTitle}>Recent Time Entries</Text>

      <ScrollView style={styles.recentList} contentContainerStyle={styles.recentListContent}>
        {recentEntries.length === 0 ? (
          <Text style={styles.emptyText}>No recent entries</Text>
        ) : (
          recentEntries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>
                <Text style={styles.entryHours}>
                  {entry.totalHours.toFixed(1)} hrs
                </Text>
              </View>
              <Text style={styles.entryProject}>{entry.projectName}</Text>
              <Text style={styles.entryTimes}>
                {formatTime(entry.timeIn)} → {formatTime(entry.timeOut)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Project Picker Modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Project</Text>
              <Pressable onPress={() => setShowProjectPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {projects.map((p) => {
                const isSelected = p.id === selectedProjectId;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.projectOption, isSelected && styles.projectOptionSelected]}
                    onPress={() => {
                      setSelectedProjectId(p.id);
                      setShowProjectPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.projectOptionText,
                        isSelected && styles.projectOptionTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {p.name}
                    </Text>
                    {isSelected && <Text style={styles.projectOptionCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 54 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#6b7280" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  linkDisabled: { color: "#9ca3af" },

  messageBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageText: { color: "#374151", fontSize: 13 },

  statusCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  statusCardActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusProject: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  statusHint: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  elapsedTime: {
    fontSize: 48,
    fontWeight: "700",
    color: "#10b981",
    fontVariant: ["tabular-nums"],
    marginTop: 8,
  },
  clockedInAt: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },

  // Project Dropdown
  projectDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: "#ffffff",
    width: "100%",
    maxWidth: 300,
  },
  projectDropdownText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  projectDropdownPlaceholder: {
    color: "#9ca3af",
    fontWeight: "400",
  },
  projectDropdownArrow: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
  },

  clockButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
    minWidth: 160,
    alignItems: "center",
  },
  clockInButton: {
    backgroundColor: "#10b981",
  },
  clockOutButton: {
    backgroundColor: "#ef4444",
  },
  clockButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  clockButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
  },

  recentList: { flex: 1 },
  recentListContent: { paddingBottom: 100 },
  emptyText: { color: "#9ca3af", textAlign: "center", marginTop: 20 },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  modalClose: {
    fontSize: 20,
    color: "#6b7280",
    padding: 4,
  },
  modalBody: {
    padding: 8,
    paddingBottom: 24,
  },
  projectOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 10,
    marginVertical: 2,
  },
  projectOptionSelected: {
    backgroundColor: "#eff6ff",
  },
  projectOptionText: {
    fontSize: 16,
    color: "#1f2937",
    flex: 1,
  },
  projectOptionTextSelected: {
    fontWeight: "700",
    color: "#1e3a8a",
  },
  projectOptionCheck: {
    fontSize: 18,
    color: "#1e3a8a",
    fontWeight: "700",
    marginLeft: 12,
  },

  entryCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryDate: { fontSize: 14, fontWeight: "600", color: "#111827" },
  entryHours: { fontSize: 14, fontWeight: "700", color: "#10b981" },
  entryProject: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  entryTimes: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
});
