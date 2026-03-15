import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiJson, apiFetch } from "../api/client";
import { colors } from "../theme/colors";

// ── Types ────────────────────────────────────────────────────────────

interface SessionEvent {
  id: string;
  eventType: string;
  summary: string;
  detail?: any;
  actorUser?: { firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
  approval?: {
    id: string;
    status: string;
    requestType: string;
    title: string;
    resolverComment?: string | null;
    resolvedAt?: string | null;
  } | null;
}

interface DevSession {
  id: string;
  title: string;
  status: string;
  sessionCode: string;
  startedAt?: string | null;
  createdAt: string;
}

interface Props {
  session: DevSession;
  onBack: () => void;
  onOpenApproval?: (approvalId: string) => void;
}

// ── Event type styling ───────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  FILE_CHANGED: "📝",
  COMMAND_RUN: "⚡",
  DECISION: "🧠",
  APPROVAL_REQUESTED: "🔔",
  APPROVAL_RESOLVED: "✅",
  COMMENT: "💬",
  MILESTONE: "🏁",
  STATUS_CHANGE: "🔄",
};

const EVENT_BG: Record<string, string> = {
  APPROVAL_REQUESTED: "#fef3c7",
  APPROVAL_RESOLVED: "#d1fae5",
  MILESTONE: "#dbeafe",
  COMMENT: "#f0f9ff",
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function elapsedTime(startStr: string): string {
  const diff = Date.now() - new Date(startStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function DevSessionDetailScreen({ session, onBack, onOpenApproval }: Props) {
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadEvents = useCallback(async () => {
    try {
      const data = await apiJson<SessionEvent[]>(
        `/dev-session/${session.id}/events?take=100`,
      );
      // Reverse to show oldest first (chat-style)
      setEvents(data.reverse());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    loadEvents();
    // Poll every 5 seconds for new events
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, [loadEvents]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [events.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  const handleSendComment = async () => {
    if (!comment.trim() || sending) return;
    setSending(true);
    try {
      await apiJson(`/dev-session/${session.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment.trim() }),
      });
      setComment("");
      await loadEvents();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      await apiFetch(`/dev-session/approval-requests/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      await loadEvents();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to approve");
    }
  };

  const handleReject = async (approvalId: string) => {
    Alert.prompt(
      "Reject Approval",
      "Add a comment (optional):",
      async (text) => {
        try {
          await apiFetch(`/dev-session/approval-requests/${approvalId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "REJECTED", comment: text || undefined }),
          });
          await loadEvents();
        } catch (e) {
          Alert.alert("Error", e instanceof Error ? e.message : "Failed to reject");
        }
      },
      "plain-text",
      "",
    );
  };

  const isActive = session.status === "ACTIVE" || session.status === "AWAITING_REVIEW";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.headerMeta}>
            {session.sessionCode} · {session.startedAt ? elapsedTime(session.startedAt) : "—"}
          </Text>
        </View>
      </View>

      {/* Event feed */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.eventList}
          contentContainerStyle={styles.eventListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onApprove={handleApprove}
              onReject={handleReject}
              onOpenApproval={onOpenApproval}
            />
          ))}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* Comment input */}
      {isActive && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Send a comment..."
            placeholderTextColor="#9ca3af"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[styles.sendBtn, !comment.trim() && styles.sendBtnDisabled]}
            onPress={handleSendComment}
            disabled={!comment.trim() || sending}
          >
            <Text style={styles.sendBtnText}>
              {sending ? "..." : "Send"}
            </Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function EventCard({
  event,
  onApprove,
  onReject,
  onOpenApproval,
}: {
  event: SessionEvent;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOpenApproval?: (id: string) => void;
}) {
  const icon = EVENT_ICONS[event.eventType] ?? "📌";
  const bg = EVENT_BG[event.eventType] ?? "#f9fafb";
  const isApprovalPending =
    event.eventType === "APPROVAL_REQUESTED" &&
    event.approval?.status === "PENDING";
  const actorName = event.actorUser
    ? `${event.actorUser.firstName ?? ""} ${event.actorUser.lastName ?? ""}`.trim() || "User"
    : "Agent";

  return (
    <View
      style={[
        styles.eventCard,
        { backgroundColor: bg },
        isApprovalPending && styles.eventCardApproval,
      ]}
    >
      <View style={styles.eventHeader}>
        <Text style={styles.eventIcon}>{icon}</Text>
        <Text style={styles.eventActor}>{actorName}</Text>
        <Text style={styles.eventTime}>{formatTime(event.createdAt)}</Text>
      </View>

      <Text style={styles.eventSummary}>{event.summary}</Text>

      {/* Show diff preview for file changes */}
      {event.eventType === "FILE_CHANGED" && event.detail?.filePath && (
        <View style={styles.diffPreview}>
          <Text style={styles.diffFile}>{event.detail.filePath}</Text>
          {event.detail.linesAdded != null && (
            <Text style={styles.diffStats}>
              <Text style={{ color: "#059669" }}>+{event.detail.linesAdded}</Text>
              {" / "}
              <Text style={{ color: "#dc2626" }}>-{event.detail.linesRemoved ?? 0}</Text>
            </Text>
          )}
        </View>
      )}

      {/* Show command output preview */}
      {event.eventType === "COMMAND_RUN" && event.detail?.command && (
        <View style={styles.commandPreview}>
          <Text style={styles.commandText} numberOfLines={3}>
            $ {event.detail.command}
          </Text>
        </View>
      )}

      {/* Approval action buttons */}
      {isApprovalPending && event.approval && (
        <View style={styles.approvalActions}>
          <Pressable
            style={styles.approveBtn}
            onPress={() => onApprove(event.approval!.id)}
          >
            <Text style={styles.approveBtnText}>✓ Approve</Text>
          </Pressable>
          <Pressable
            style={styles.rejectBtn}
            onPress={() => onReject(event.approval!.id)}
          >
            <Text style={styles.rejectBtnText}>✕ Reject</Text>
          </Pressable>
          {onOpenApproval && (
            <Pressable
              style={styles.detailBtn}
              onPress={() => onOpenApproval(event.approval!.id)}
            >
              <Text style={styles.detailBtnText}>Details</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Show resolution for resolved approvals */}
      {event.eventType === "APPROVAL_RESOLVED" && event.detail?.status && (
        <View
          style={[
            styles.resolutionBadge,
            {
              backgroundColor:
                event.detail.status === "APPROVED" ? "#d1fae5" : "#fee2e2",
            },
          ]}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: event.detail.status === "APPROVED" ? "#059669" : "#dc2626",
            }}
          >
            {event.detail.status}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    gap: 12,
  },
  backBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  backText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: "600" },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.textOnPrimary },
  headerMeta: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  eventList: { flex: 1 },
  eventListContent: { padding: 16 },
  eventCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventCardApproval: {
    borderColor: "#d97706",
    borderWidth: 2,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  eventIcon: { fontSize: 14 },
  eventActor: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, flex: 1 },
  eventTime: { fontSize: 11, color: colors.textMuted },
  eventSummary: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  diffPreview: {
    marginTop: 8,
    backgroundColor: "#1e293b",
    borderRadius: 6,
    padding: 8,
  },
  diffFile: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  diffStats: { fontSize: 12, fontFamily: "monospace", marginTop: 4 },
  commandPreview: {
    marginTop: 8,
    backgroundColor: "#1e293b",
    borderRadius: 6,
    padding: 8,
  },
  commandText: { fontSize: 12, color: "#e2e8f0", fontFamily: "monospace" },
  approvalActions: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: "#059669",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  approveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  rejectBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  detailBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  detailBtnText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  resolutionBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    backgroundColor: colors.background,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: colors.textPrimary,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
