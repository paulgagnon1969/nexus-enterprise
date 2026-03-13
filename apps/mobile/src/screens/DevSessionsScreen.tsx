import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { apiJson } from "../api/client";
import { colors } from "../theme/colors";

interface DevSession {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  sessionCode: string;
  startedAt?: string | null;
  endedAt?: string | null;
  lastHeartbeat?: string | null;
  createdAt: string;
  createdBy?: { firstName?: string | null; lastName?: string | null } | null;
  _count?: { events?: number; approvals?: number };
}

interface Props {
  onSelectSession: (session: DevSession) => void;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: "#059669", bg: "#d1fae5", label: "Active" },
  PAUSED: { color: "#6b7280", bg: "#f3f4f6", label: "Paused" },
  AWAITING_REVIEW: { color: "#d97706", bg: "#fef3c7", label: "Awaiting Review" },
  COMPLETED: { color: "#3b82f6", bg: "#dbeafe", label: "Completed" },
  CANCELLED: { color: "#dc2626", bg: "#fee2e2", label: "Cancelled" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DevSessionsScreen({ onSelectSession }: Props) {
  const [sessions, setSessions] = useState<DevSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const data = await apiJson<DevSession[]>("/dev-session");
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    // Auto-refresh every 15 seconds
    const interval = setInterval(loadSessions, 15000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  }, [loadSessions]);

  const activeSessions = sessions.filter(
    (s) => s.status === "ACTIVE" || s.status === "AWAITING_REVIEW" || s.status === "PAUSED",
  );
  const completedSessions = sessions.filter(
    (s) => s.status === "COMPLETED" || s.status === "CANCELLED",
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Session Mirror</Text>
        <Text style={styles.subtitle}>Dev Oversight</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={loadSessions}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔭</Text>
          <Text style={styles.emptyText}>No dev sessions yet</Text>
          <Text style={styles.emptySubtext}>
            Sessions will appear here when Warp starts working on tasks
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {activeSessions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Active</Text>
              {activeSessions.map((s) => (
                <SessionCard key={s.id} session={s} onPress={() => onSelectSession(s)} />
              ))}
            </>
          )}

          {completedSessions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Recent</Text>
              {completedSessions.map((s) => (
                <SessionCard key={s.id} session={s} onPress={() => onSelectSession(s)} />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function SessionCard({
  session,
  onPress,
}: {
  session: DevSession;
  onPress: () => void;
}) {
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.ACTIVE;
  const isActive = session.status === "ACTIVE";
  const pendingApprovals = session._count?.approvals ?? 0;

  return (
    <Pressable
      style={[styles.card, isActive && styles.cardActive]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          {isActive && <View style={[styles.liveDot, { backgroundColor: config.color }]} />}
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>
        <Text style={styles.codeText}>{session.sessionCode}</Text>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {session.title}
      </Text>

      {session.description && (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {session.description}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>
          {timeAgo(session.createdAt)}
          {session._count?.events ? ` · ${session._count.events} events` : ""}
        </Text>
        {pendingApprovals > 0 && (
          <View style={styles.approvalBadge}>
            <Text style={styles.approvalBadgeText}>
              {pendingApprovals} pending
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.primary,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.textOnPrimary },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  errorText: { color: colors.error, fontSize: 14, textAlign: "center", marginBottom: 12 },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "600" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  emptySubtext: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  list: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardActive: { borderColor: "#059669", borderWidth: 1.5 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  codeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  approvalBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  approvalBadgeText: { fontSize: 11, fontWeight: "700", color: "#d97706" },
});
