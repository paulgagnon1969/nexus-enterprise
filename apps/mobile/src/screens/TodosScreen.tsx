import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import {
  fetchAllTasks,
  updateTaskStatus,
  updateTask,
  fetchCompanyMembers,
  disposeTask,
  addTaskNote,
  fetchTaskActivities,
} from "../api/tasks";
import type { TeamMember } from "../api/tasks";
import { colors } from "../theme/colors";
import * as Haptics from "expo-haptics";
import type { TaskItem, TaskStatus, TaskDisposition, TaskActivityItem, TaskUserRef } from "../types/api";

// ── Urgency bucketing ───────────────────────────────────────────────
type UrgencyBucket = "overdue" | "dueSoon" | "upcoming" | "noDue" | "done";

function classifyTask(task: TaskItem): UrgencyBucket {
  if (task.status === "DONE") return "done";
  if (!task.dueDate) return "noDue";

  const now = new Date();
  const due = new Date(task.dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "overdue";     // past due
  if (diffDays <= 1) return "dueSoon";     // within 24 h
  return "upcoming";                        // > 1 day out (green)
}

const BUCKET_META: Record<
  UrgencyBucket,
  { label: string; icon: string; bg: string; border: string; textColor: string }
> = {
  overdue: {
    label: "Overdue",
    icon: "🛑",
    bg: "#fee2e2",
    border: "#fca5a5",
    textColor: "#991b1b",
  },
  dueSoon: {
    label: "Due Soon",
    icon: "⚠️",
    bg: "#fef3c7",
    border: "#fcd34d",
    textColor: "#92400e",
  },
  upcoming: {
    label: "Upcoming",
    icon: "✅",
    bg: "#d1fae5",
    border: "#6ee7b7",
    textColor: "#065f46",
  },
  noDue: {
    label: "No Due Date",
    icon: "📌",
    bg: "#e5e7eb",
    border: "#d1d5db",
    textColor: "#374151",
  },
  done: {
    label: "Completed",
    icon: "☑️",
    bg: "#f3f4f6",
    border: "#d1d5db",
    textColor: "#6b7280",
  },
};

// The order we display buckets (overdue first for urgency)
const BUCKET_ORDER: UrgencyBucket[] = ["overdue", "dueSoon", "upcoming", "noDue", "done"];

// ── Component ───────────────────────────────────────────────────────
export function TodosScreen() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<UrgencyBucket>>(
    new Set(["done"]) // completed collapsed by default
  );

  // Detail card state
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailActionLoading, setDetailActionLoading] = useState(false);

  // Disposition state
  const [selectedDisposition, setSelectedDisposition] = useState<TaskDisposition | null>(null);
  const [showDispositionPicker, setShowDispositionPicker] = useState(false);
  const [dispositionNote, setDispositionNote] = useState("");

  // Activity log
  const [activities, setActivities] = useState<TaskActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Reassign state
  const [showReassign, setShowReassign] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const items = await fetchAllTasks();
      setTasks(items);
    } catch (e) {
      console.warn("[TodosScreen] Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTasks();
  }, [loadTasks]);

  // Open detail card and load activities
  const openDetail = (task: TaskItem) => {
    void Haptics.selectionAsync();
    setSelectedTask(task);
    setSelectedDisposition(null);
    setDispositionNote("");
    setShowDetail(true);
    loadActivities(task.id);
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedTask(null);
    setActivities([]);
    setSelectedDisposition(null);
    setDispositionNote("");
  };

  // Load activity log
  const loadActivities = async (taskId: string) => {
    setActivitiesLoading(true);
    try {
      const items = await fetchTaskActivities(taskId);
      setActivities(items);
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  // Submit disposition (Approve / Reject / Reassign)
  const handleSubmitDisposition = async (reassigneeId?: string) => {
    if (!selectedTask || !selectedDisposition) return;
    setDetailActionLoading(true);
    try {
      const updated = await disposeTask(selectedTask.id, {
        disposition: selectedDisposition,
        note: dispositionNote || undefined,
        assigneeId: reassigneeId,
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t))
      );
      setSelectedTask(updated);
      setSelectedDisposition(null);
      setDispositionNote("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const label = selectedDisposition === "APPROVED" ? "approved" : selectedDisposition === "REJECTED" ? "rejected" : "reassigned";
      Alert.alert("Done", `Task ${label} successfully.`);
      loadActivities(selectedTask.id);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to submit disposition");
    } finally {
      setDetailActionLoading(false);
    }
  };

  // Mark complete (separate from disposition)
  const handleMarkComplete = async () => {
    if (!selectedTask) return;
    setDetailActionLoading(true);
    try {
      const updated = await updateTaskStatus(selectedTask.id, "DONE");
      setTasks((prev) =>
        prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t))
      );
      setSelectedTask(updated);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadActivities(selectedTask.id);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to mark task complete");
    } finally {
      setDetailActionLoading(false);
    }
  };

  // Reopen from detail card
  const handleReopenTask = async () => {
    if (!selectedTask) return;
    setDetailActionLoading(true);
    try {
      const updated = await updateTaskStatus(selectedTask.id, "TODO");
      setTasks((prev) =>
        prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t))
      );
      setSelectedTask(updated);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadActivities(selectedTask.id);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to reopen task");
    } finally {
      setDetailActionLoading(false);
    }
  };

  // Open reassign picker (for disposition REASSIGNED)
  const openReassign = async () => {
    setShowReassign(true);
    setMembersLoading(true);
    try {
      const list = await fetchCompanyMembers();
      setMembers(list);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  // Reassign via disposition flow
  const handleReassign = async (memberId: string) => {
    setShowReassign(false);
    await handleSubmitDisposition(memberId);
  };

  // Select a disposition option
  const handleDispositionSelect = (d: TaskDisposition) => {
    setSelectedDisposition(d);
    setShowDispositionPicker(false);
    // If reassign, open member picker immediately
    if (d === "REASSIGNED") {
      openReassign();
    }
  };

  const toggleCollapse = (bucket: UrgencyBucket) => {
    void Haptics.selectionAsync();
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  // Bucket the tasks
  const buckets: Record<UrgencyBucket, TaskItem[]> = {
    overdue: [],
    dueSoon: [],
    upcoming: [],
    noDue: [],
    done: [],
  };
  for (const t of tasks) {
    buckets[classifyTask(t)].push(t);
  }

  // Sort within each bucket by dueDate ascending (soonest first)
  for (const key of BUCKET_ORDER) {
    buckets[key].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  const totalActive = buckets.overdue.length + buckets.dueSoon.length + buckets.upcoming.length + buckets.noDue.length;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ToDo's</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ToDo's</Text>
        <Text style={styles.headerCount}>
          {totalActive} active task{totalActive !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        {buckets.overdue.length > 0 && (
          <View style={[styles.summaryPill, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.summaryPillText, { color: "#991b1b" }]}>
              🛑 {buckets.overdue.length}
            </Text>
          </View>
        )}
        {buckets.dueSoon.length > 0 && (
          <View style={[styles.summaryPill, { backgroundColor: "#fef3c7" }]}>
            <Text style={[styles.summaryPillText, { color: "#92400e" }]}>
              ⚠️ {buckets.dueSoon.length}
            </Text>
          </View>
        )}
        {buckets.upcoming.length > 0 && (
          <View style={[styles.summaryPill, { backgroundColor: "#d1fae5" }]}>
            <Text style={[styles.summaryPillText, { color: "#065f46" }]}>
              ✅ {buckets.upcoming.length}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {tasks.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>No tasks — you're all caught up!</Text>
          </View>
        )}

        {BUCKET_ORDER.map((bucket) => {
          const items = buckets[bucket];
          if (items.length === 0) return null;
          const meta = BUCKET_META[bucket];
          const collapsed = collapsedBuckets.has(bucket);

          return (
            <View key={bucket} style={styles.bucketContainer}>
              <Pressable
                style={[styles.bucketHeader, { backgroundColor: meta.bg, borderColor: meta.border }]}
                onPress={() => toggleCollapse(bucket)}
              >
                <Text style={[styles.bucketTitle, { color: meta.textColor }]}>
                  {meta.icon} {meta.label} ({items.length})
                </Text>
                <Text style={[styles.bucketChevron, { color: meta.textColor }]}>
                  {collapsed ? "▸" : "▾"}
                </Text>
              </Pressable>

              {!collapsed &&
                items.map((task) => {
                  const isDone = task.status === "DONE";
                  const isGroup = (task.groupMembers?.length ?? 0) > 0;
                  const assigneeLabel = isGroup
                    ? `👥 ${task.groupMembers!.map((gm) => shortName(gm.user)).join(", ")}`
                    : task.assignee
                      ? `👤 ${shortName(task.assignee)}`
                      : null;
                  const dueDateStr = task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString()
                    : null;

                  return (
                    <Pressable
                      key={task.id}
                      style={[
                        styles.taskCard,
                        { borderLeftColor: meta.border, borderLeftWidth: 4 },
                      ]}
                      onPress={() => openDetail(task)}
                    >
                      <View style={[styles.statusDot, isDone && styles.statusDotDone]} />
                      <View style={styles.taskBody}>
                        <Text
                          style={[styles.taskTitle, isDone && styles.taskTitleDone]}
                          numberOfLines={2}
                        >
                          {task.title}
                        </Text>
                        {task.description ? (
                          <Text style={styles.taskDesc} numberOfLines={1}>
                            {task.description}
                          </Text>
                        ) : null}
                        <View style={styles.taskMeta}>
                          {assigneeLabel && (
                            <Text style={styles.taskMetaItem} numberOfLines={1}>{assigneeLabel}</Text>
                          )}
                          {isDone && task.completedBy && (
                            <Text style={styles.taskMetaItem}>✓ {shortName(task.completedBy)}</Text>
                          )}
                          {dueDateStr && (
                            <Text style={styles.taskMetaItem}>📅 {dueDateStr}</Text>
                          )}
                          <View
                            style={[
                              styles.priorityBadge,
                              getPriorityStyle(task.priority),
                            ]}
                          >
                            <Text style={styles.priorityText}>{task.priority}</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.taskChevron}>›</Text>
                    </Pressable>
                  );
                })}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Task Review Modal */}
      <Modal
        visible={showDetail}
        animationType="slide"
        transparent
        onRequestClose={closeDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Task Review</Text>
              <Pressable onPress={closeDetail}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {selectedTask && (
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.detailTitle}>{selectedTask.title}</Text>

                {selectedTask.description ? (
                  <Text style={styles.detailDesc}>{selectedTask.description}</Text>
                ) : null}

                {/* Info rows */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[
                    styles.detailStatusBadge,
                    selectedTask.status === "DONE" && { backgroundColor: "#d1fae5" },
                    selectedTask.status === "BLOCKED" && { backgroundColor: "#fee2e2" },
                    selectedTask.status === "IN_PROGRESS" && { backgroundColor: "#dbeafe" },
                  ]}>
                    <Text style={styles.detailStatusText}>{selectedTask.status}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Priority</Text>
                  <View style={[styles.priorityBadge, getPriorityStyle(selectedTask.priority)]}>
                    <Text style={styles.priorityText}>{selectedTask.priority}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {(selectedTask.groupMembers?.length ?? 0) > 0 ? "Group" : "Assignee"}
                  </Text>
                  <Text style={styles.detailValue}>
                    {(selectedTask.groupMembers?.length ?? 0) > 0
                      ? selectedTask.groupMembers!.map((gm) => shortName(gm.user)).join(", ")
                      : selectedTask.assignee
                        ? shortName(selectedTask.assignee)
                        : "Unassigned"}
                  </Text>
                </View>

                {selectedTask.completedBy && selectedTask.status === "DONE" && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Completed By</Text>
                    <Text style={styles.detailValue}>{shortName(selectedTask.completedBy)}</Text>
                  </View>
                )}

                {selectedTask.dueDate && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Due Date</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedTask.dueDate).toLocaleDateString()}
                    </Text>
                  </View>
                )}

                {selectedTask.createdBy && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Created By</Text>
                    <Text style={styles.detailValue}>
                      {[selectedTask.createdBy.firstName, selectedTask.createdBy.lastName]
                        .filter(Boolean).join(" ") || selectedTask.createdBy.email}
                    </Text>
                  </View>
                )}

                {/* Current disposition (if set) */}
                {selectedTask.disposition && selectedTask.disposition !== "NONE" && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Disposition</Text>
                    <View style={[
                      styles.dispositionBadge,
                      selectedTask.disposition === "APPROVED" && { backgroundColor: "#d1fae5" },
                      selectedTask.disposition === "REJECTED" && { backgroundColor: "#fee2e2" },
                      selectedTask.disposition === "REASSIGNED" && { backgroundColor: "#dbeafe" },
                    ]}>
                      <Text style={styles.dispositionBadgeText}>{selectedTask.disposition}</Text>
                    </View>
                  </View>
                )}

                {/* ── Disposition Section ── */}
                {selectedTask.status !== "DONE" && (
                  <View style={styles.dispositionSection}>
                    <Text style={styles.sectionTitle}>Disposition</Text>

                    {/* Dropdown trigger */}
                    <Pressable
                      style={styles.dispositionDropdown}
                      onPress={() => setShowDispositionPicker(true)}
                    >
                      <Text style={[
                        styles.dispositionDropdownText,
                        !selectedDisposition && { color: "#9ca3af" },
                      ]}>
                        {selectedDisposition === "APPROVED" ? "Approve WF"
                          : selectedDisposition === "REJECTED" ? "Reject Task"
                            : selectedDisposition === "REASSIGNED" ? "Reassign Task"
                              : "Select disposition..."}
                      </Text>
                      <Text style={styles.dispositionChevron}>▾</Text>
                    </Pressable>

                    {/* Note / Memo */}
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Add a note or memo (optional)..."
                      placeholderTextColor="#9ca3af"
                      value={dispositionNote}
                      onChangeText={setDispositionNote}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />

                    {/* Submit Disposition */}
                    {selectedDisposition && selectedDisposition !== "REASSIGNED" && (
                      <Pressable
                        style={[
                          styles.detailBtn,
                          selectedDisposition === "APPROVED" ? styles.detailBtnApprove : styles.detailBtnReject,
                        ]}
                        onPress={() => handleSubmitDisposition()}
                        disabled={detailActionLoading}
                      >
                        <Text style={styles.detailBtnText}>
                          {detailActionLoading ? "Submitting..."
                            : selectedDisposition === "APPROVED" ? "Submit Approval"
                              : "Submit Rejection"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* ── Action Buttons ── */}
                <View style={styles.detailActions}>
                  {selectedTask.status !== "DONE" ? (
                    <Pressable
                      style={[styles.detailBtn, styles.detailBtnComplete]}
                      onPress={handleMarkComplete}
                      disabled={detailActionLoading}
                    >
                      <Text style={styles.detailBtnText}>
                        {detailActionLoading ? "Completing..." : "Mark Task Complete"}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.detailBtn, styles.detailBtnReopen]}
                      onPress={handleReopenTask}
                      disabled={detailActionLoading}
                    >
                      <Text style={styles.detailBtnText}>
                        {detailActionLoading ? "Reopening..." : "Reopen Task"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* ── Activity Log ── */}
                <View style={styles.activitySection}>
                  <Text style={styles.sectionTitle}>Activity Log</Text>
                  {activitiesLoading ? (
                    <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
                  ) : activities.length === 0 ? (
                    <Text style={styles.activityEmpty}>No activity yet</Text>
                  ) : (
                    activities.map((a) => {
                      const actorName = a.actor
                        ? [a.actor.firstName, a.actor.lastName].filter(Boolean).join(" ") || a.actor.email
                        : "System";
                      const timeStr = new Date(a.createdAt).toLocaleString();
                      return (
                        <View key={a.id} style={styles.activityRow}>
                          <View style={styles.activityDot} />
                          <View style={styles.activityContent}>
                            <Text style={styles.activityAction}>
                              <Text style={styles.activityActor}>{actorName}</Text>
                              {" "}{formatAction(a.action, a.newValue)}
                            </Text>
                            {a.note ? (
                              <Text style={styles.activityNote}>"{a.note}"</Text>
                            ) : null}
                            <Text style={styles.activityTime}>{timeStr}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Disposition Picker Modal */}
      <Modal
        visible={showDispositionPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDispositionPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowDispositionPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Disposition</Text>
            {([
              { value: "APPROVED" as TaskDisposition, label: "Approve WF", icon: "✅", color: "#059669" },
              { value: "REJECTED" as TaskDisposition, label: "Reject Task", icon: "❌", color: "#dc2626" },
              { value: "REASSIGNED" as TaskDisposition, label: "Reassign Task", icon: "🔄", color: "#2563eb" },
            ]).map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.pickerOption, selectedDisposition === opt.value && styles.pickerOptionSelected]}
                onPress={() => handleDispositionSelect(opt.value)}
              >
                <Text style={styles.pickerOptionIcon}>{opt.icon}</Text>
                <Text style={[styles.pickerOptionLabel, { color: opt.color }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Reassign Picker Modal */}
      <Modal
        visible={showReassign}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReassign(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reassign To</Text>
              <Pressable onPress={() => setShowReassign(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {membersLoading ? (
                <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
              ) : members.length === 0 ? (
                <Text style={styles.emptyText}>No team members found</Text>
              ) : (
                members.map((m) => {
                  const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
                  const isCurrent = selectedTask?.assigneeId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      style={[styles.memberOption, isCurrent && styles.memberOptionCurrent]}
                      onPress={() => void handleReassign(m.id)}
                      disabled={isCurrent || detailActionLoading}
                    >
                      <Text style={[styles.memberName, isCurrent && styles.memberNameCurrent]}>
                        {name}
                      </Text>
                      {isCurrent && <Text style={styles.memberCurrentLabel}>Current</Text>}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Format activity action for display
function formatAction(action: string, newValue?: string | null): string {
  switch (action) {
    case "CREATED": return "created this task";
    case "COMPLETED": return "marked task complete";
    case "REOPENED": return "reopened this task";
    case "REASSIGNED": return "reassigned this task";
    case "NOTE_ADDED": return "added a note";
    case "STATUS_CHANGED": return `changed status to ${newValue ?? "unknown"}`;
    case "DISPOSITION_SET":
      return newValue === "APPROVED" ? "approved (WF)"
        : newValue === "REJECTED" ? "rejected the task"
          : newValue === "REASSIGNED" ? "reassigned via disposition"
            : `set disposition to ${newValue ?? "unknown"}`;
    default: return action.toLowerCase().replace(/_/g, " ");
  }
}

/** Expose urgency counts for badge rendering in the navigator */
export function useTaskBadgeCounts(tasks: TaskItem[]) {
  let overdue = 0;
  let dueSoon = 0;
  for (const t of tasks) {
    const b = classifyTask(t);
    if (b === "overdue") overdue++;
    else if (b === "dueSoon") dueSoon++;
  }
  return { overdue, dueSoon, total: overdue + dueSoon };
}

// ── Helpers ──────────────────────────────────────────────────────────
/** Display-friendly short name from a user ref. */
function shortName(u: TaskUserRef): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.email;
}

function getPriorityStyle(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return { backgroundColor: "#fee2e2" } as const;
    case "HIGH":
      return { backgroundColor: "#ffedd5" } as const;
    case "MEDIUM":
      return { backgroundColor: "#e0e7ff" } as const;
    case "LOW":
      return { backgroundColor: "#d1fae5" } as const;
    default:
      return { backgroundColor: "#e5e7eb" } as const;
  }
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerCount: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "500",
  },
  summaryStrip: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  summaryPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "500",
  },
  // Bucket
  bucketContainer: {
    marginBottom: 16,
  },
  bucketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  bucketTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  bucketChevron: {
    fontSize: 16,
    fontWeight: "700",
  },
  // Task card
  taskCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    marginRight: 10,
    marginTop: 5,
  },
  statusDotDone: {
    backgroundColor: colors.success,
  },
  taskChevron: {
    fontSize: 22,
    color: "#9ca3af",
    marginLeft: 8,
    alignSelf: "center",
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  taskDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  taskMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    alignItems: "center",
  },
  taskMetaItem: {
    fontSize: 11,
    color: colors.textMuted,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
  },

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
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: 20,
    color: "#6b7280",
    padding: 4,
  },
  modalBody: {
    padding: 16,
    paddingBottom: 32,
  },

  // Detail card
  detailTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  detailDesc: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  detailStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  detailStatusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  detailBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  detailBtnComplete: {
    backgroundColor: "#6366f1",
  },
  detailBtnApprove: {
    backgroundColor: "#059669",
  },
  detailBtnReject: {
    backgroundColor: "#dc2626",
  },
  detailBtnReopen: {
    backgroundColor: "#3b82f6",
  },
  detailBtnReassign: {
    backgroundColor: "#6366f1",
  },
  detailBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Disposition section
  dispositionSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  dispositionDropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  dispositionDropdownText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  dispositionChevron: {
    fontSize: 14,
    color: "#9ca3af",
  },
  dispositionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  dispositionBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  noteInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 72,
    marginBottom: 12,
  },

  // Disposition picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    width: "80%",
    maxWidth: 320,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 14,
    textAlign: "center",
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 2,
  },
  pickerOptionSelected: {
    backgroundColor: "#eff6ff",
  },
  pickerOptionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  pickerOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Activity log
  activitySection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  activityEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 4,
  },
  activityRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366f1",
    marginTop: 6,
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  activityActor: {
    fontWeight: "700",
  },
  activityNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  activityTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },

  // Reassign picker
  memberOption: {
    padding: 14,
    borderRadius: 10,
    marginVertical: 2,
  },
  memberOptionCurrent: {
    backgroundColor: "#eff6ff",
  },
  memberName: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  memberNameCurrent: {
    fontWeight: "700",
    color: "#1e3a8a",
  },
  memberCurrentLabel: {
    fontSize: 11,
    color: "#2563eb",
    fontWeight: "600",
    marginTop: 2,
  },
});
