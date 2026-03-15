import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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
  updatedAt?: string;
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

  // ── Create session form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSessions = useCallback(async (q?: string) => {
    try {
      setError(null);
      const url = q ? `/dev-session?q=${encodeURIComponent(q)}` : "/dev-session";
      const data = await apiJson<DevSession[]>(url);
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search — fires 400ms after user stops typing
  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadSessions(text.trim() || undefined);
    }, 400);
  }, [loadSessions]);

  // ── Focus-aware polling: only poll when screen is visible + app is active ──
  useFocusEffect(
    useCallback(() => {
      // Load immediately on focus
      loadSessions();

      // Start polling
      intervalRef.current = setInterval(loadSessions, 15000);

      // Pause polling when app backgrounds, resume on foreground
      const handleAppState = (state: AppStateStatus) => {
        if (state === "active") {
          loadSessions();
          if (!intervalRef.current) {
            intervalRef.current = setInterval(loadSessions, 15000);
          }
        } else {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      };
      const sub = AppState.addEventListener("change", handleAppState);

      return () => {
        // Stop polling on blur
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        sub.remove();
      };
    }, [loadSessions]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  }, [loadSessions]);

  // ── Remote session creation ──
  const handleCreate = useCallback(async () => {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const session = await apiJson<DevSession>("/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || undefined }),
      });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      onSelectSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }, [newTitle, newDesc, creating, onSelectSession]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.title}>Session Mirror</Text>
              {sessions.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{sessions.length}</Text>
                </View>
              )}
            </View>
            <Text style={styles.subtitle}>Dev Oversight</Text>
          </View>
          <Pressable
            style={styles.createBtn}
            onPress={() => setShowCreate(!showCreate)}
            hitSlop={8}
          >
            <Text style={styles.createBtnText}>{showCreate ? "✕" : "+"}</Text>
          </Pressable>
        </View>

        {/* Inline create form */}
        {showCreate && (
          <View style={styles.createForm}>
            <TextInput
              style={styles.createInput}
              placeholder="Session title…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />
            <TextInput
              style={[styles.createInput, styles.createInputDesc]}
              placeholder="Description (optional)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <Pressable
              style={[styles.createSubmit, !newTitle.trim() && { opacity: 0.4 }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || creating}
            >
              <Text style={styles.createSubmitText}>
                {creating ? "Creating…" : "Start Session"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search sessions…"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
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
            Tap + to start a session, or they'll appear here when Warp starts working
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Flat list — API returns sorted by updatedAt DESC */}
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onPress={() => onSelectSession(s)} />
          ))}
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
          {timeAgo(session.updatedAt ?? session.createdAt)}
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.textOnPrimary },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  createForm: { marginTop: 12 },
  createInput: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#fff",
    marginBottom: 8,
  },
  createInputDesc: { minHeight: 50, textAlignVertical: "top" },
  createSubmit: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  createSubmitText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  searchInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
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
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
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
