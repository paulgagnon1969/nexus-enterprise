import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors } from "../theme/colors";
import { getApiBaseUrl } from "../api/config";
import { getPipToken, setPipToken, clearPipToken } from "../storage/pipToken";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CamScores {
  uniqueness: number;
  value: number;
  demonstrable: number;
  defensible: number;
  total: number;
}

interface CamEntry {
  camId: string;
  code: string;
  title: string;
  category: string;
  status: string;
  htmlContent: string;
  htmlBody?: string;
  scores: CamScores;
  updatedAt?: string;
}

interface CamModule {
  mode: string;
  modeLabel: string;
  camCount: number;
  aggregateScore: number;
  cams: CamEntry[];
}

interface HandbookData {
  modules: CamModule[];
  totalCams: number;
  overallAvgScore: number;
  _shareContext: {
    serialNumber: string;
    inviterName: string;
    recipientName: string | null;
    recipientEmail: string | null;
    accessedAt: string;
    visitNumber: number;
  };
}

interface CamReadStatusEntry {
  camId: string;
  lastReadAt: string;
  isFavorite: boolean;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  authorName: string;
  createdAt: string;
}

interface DiscThread {
  id: string;
  title: string;
  camSection: string | null;
  isPinned: boolean;
  isFaq: boolean;
  messageCount: number;
  createdBy: { id: string; name: string };
  lastMessage: { preview: string; authorName: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface DiscMessage {
  id: string;
  body: string;
  isSystemMessage: boolean;
  author: { id: string; name: string };
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_ICONS: Record<string, string> = {
  EST: "💰", FIN: "📊", OPS: "🏗️", HR: "👷", CLT: "🤝", CMP: "✅", TECH: "⚡",
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTO: "Automation", INTL: "Intelligence", INTG: "Integration", VIS: "Visibility",
  SPD: "Speed", ACC: "Accuracy", CMP: "Compliance", COLLAB: "Collaboration",
};

function scoreTier(score: number): string {
  if (score >= 35) return "🏆 Elite";
  if (score >= 30) return "⭐ Strong";
  if (score >= 24) return "✅ Qualified";
  return "—";
}

function scoreColor(score: number): string {
  if (score >= 35) return "#059669";
  if (score >= 30) return "#0284c7";
  if (score >= 24) return "#b45309";
  return "#6b7280";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PipScreen({
  pipToken: externalToken,
  onTokenSaved,
}: {
  pipToken: string | null;
  onTokenSaved: (token: string | null) => void;
}) {
  const API = getApiBaseUrl();
  const [token, setToken] = useState(externalToken);
  const [tokenInput, setTokenInput] = useState("");
  const [validating, setValidating] = useState(false);

  // Data
  const [handbook, setHandbook] = useState<HandbookData | null>(null);
  const [camStatuses, setCamStatuses] = useState<CamReadStatusEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [expandedCam, setExpandedCam] = useState<string | null>(null);
  const [expandedDiscussion, setExpandedDiscussion] = useState<string | null>(null);
  const [showAnnouncements, setShowAnnouncements] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Discussion state
  const [threads, setThreads] = useState<DiscThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<DiscMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);

  // ─── Token validation ───────────────────────────────────────────────
  const validateAndSave = async () => {
    const raw = tokenInput.trim();
    if (!raw) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/cam-access/${raw}`);
      if (!res.ok) throw new Error("Invalid token");
      const gate = await res.json();
      if (!gate.valid) throw new Error("Token is not valid or has been revoked.");
      await setPipToken(raw);
      setToken(raw);
      onTokenSaved(raw);
    } catch (e: any) {
      setError(e.message || "Failed to validate token");
    } finally {
      setValidating(false);
    }
  };

  const handleLogout = async () => {
    await clearPipToken();
    setToken(null);
    setHandbook(null);
    setCamStatuses([]);
    setAnnouncements([]);
    onTokenSaved(null);
  };

  // ─── Data loading ──────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [contentRes, statusesRes, announcementsRes] = await Promise.all([
        fetch(`${API}/cam-access/${token}/content`),
        fetch(`${API}/cam-access/${token}/discussions/cam-statuses`),
        fetch(`${API}/cam-access/${token}/discussions/announcements`),
      ]);
      if (contentRes.ok) {
        setHandbook(await contentRes.json());
      } else if (contentRes.status === 403 || contentRes.status === 404) {
        // Token invalid/revoked
        await clearPipToken();
        setToken(null);
        onTokenSaved(null);
        setError("Your access has been revoked or expired.");
        return;
      }
      if (statusesRes.ok) setCamStatuses(await statusesRes.json());
      if (announcementsRes.ok) setAnnouncements(await announcementsRes.json());

      // Register push token for PIP notifications
      registerPipPush(token);
    } catch (e: any) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadAll();
  }, [token, loadAll]);

  // ─── Push registration ─────────────────────────────────────────────
  const pushRegistered = useRef(false);
  const registerPipPush = async (t: string) => {
    if (pushRegistered.current) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      await fetch(`${API}/cam-access/${t}/discussions/register-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expoPushToken: tokenData.data }),
      });
      pushRegistered.current = true;
    } catch {
      // Silently fail — push is optional
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────
  const camBadgeColor = (cam: CamEntry): string => {
    const status = camStatuses.find((s) => s.camId === (cam.camId || cam.code));
    if (!status) return "#fef9c3"; // yellow — new
    if (status.isFavorite) return "#fef3c7"; // gold
    if (cam.updatedAt && new Date(cam.updatedAt) > new Date(status.lastReadAt)) {
      return "#dcfce7"; // green — updated
    }
    return "transparent"; // read
  };

  const camBadgeBorder = (cam: CamEntry): string => {
    const bg = camBadgeColor(cam);
    if (bg === "#fef9c3") return "#eab308";
    if (bg === "#fef3c7") return "#f59e0b";
    if (bg === "#dcfce7") return "#22c55e";
    return "#d1d5db";
  };

  const markCamRead = async (camId: string) => {
    if (!token) return;
    try {
      await fetch(`${API}/cam-access/${token}/discussions/cam-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camId }),
      });
      setCamStatuses((prev) => {
        const idx = prev.findIndex((s) => s.camId === camId);
        const now = new Date().toISOString();
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], lastReadAt: now };
          return copy;
        }
        return [...prev, { camId, lastReadAt: now, isFavorite: false }];
      });
    } catch { /* ignore */ }
  };

  const toggleFavorite = async (camId: string) => {
    if (!token) return;
    void Haptics.selectionAsync();
    try {
      const res = await fetch(`${API}/cam-access/${token}/discussions/cam-favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCamStatuses((prev) => {
          const idx = prev.findIndex((s) => s.camId === camId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], isFavorite: data.isFavorite };
            return copy;
          }
          return [...prev, { camId, lastReadAt: new Date().toISOString(), isFavorite: data.isFavorite }];
        });
      }
    } catch { /* ignore */ }
  };

  // ─── Discussion loading ────────────────────────────────────────────
  const loadThreads = async (camSection: string) => {
    if (!token) return;
    setThreadsLoading(true);
    try {
      const res = await fetch(
        `${API}/cam-access/${token}/discussions?camSection=${encodeURIComponent(camSection)}`,
      );
      if (res.ok) setThreads(await res.json());
    } catch { /* ignore */ }
    setThreadsLoading(false);
  };

  const loadMessages = async (threadId: string) => {
    if (!token) return;
    setMsgsLoading(true);
    try {
      const res = await fetch(`${API}/cam-access/${token}/discussions/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch { /* ignore */ }
    setMsgsLoading(false);
  };

  const handleReply = async (threadId: string) => {
    if (!token || !replyBody.trim()) return;
    setReplying(true);
    try {
      await fetch(`${API}/cam-access/${token}/discussions/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      setReplyBody("");
      loadMessages(threadId);
    } catch {
      Alert.alert("Error", "Failed to post reply");
    }
    setReplying(false);
  };

  const handleCreateThread = async (camSection: string) => {
    if (!token || !newTitle.trim() || !newBody.trim()) return;
    setCreating(true);
    try {
      await fetch(`${API}/cam-access/${token}/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camSection, title: newTitle.trim(), body: newBody.trim() }),
      });
      setNewTitle("");
      setNewBody("");
      setShowNewThread(false);
      loadThreads(camSection);
    } catch {
      Alert.alert("Error", "Failed to create thread");
    }
    setCreating(false);
  };

  // ─── Discussion expand toggle ──────────────────────────────────────
  const toggleDiscussion = (camKey: string) => {
    if (expandedDiscussion === camKey) {
      setExpandedDiscussion(null);
      setActiveThread(null);
      setMessages([]);
    } else {
      setExpandedDiscussion(camKey);
      setActiveThread(null);
      setMessages([]);
      loadThreads(camKey);
    }
  };

  // ─── Render: Token entry ──────────────────────────────────────────
  if (!token) {
    return (
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.tokenEntry}>
          <Text style={s.tokenTitle}>📊 PIP Access</Text>
          <Text style={s.tokenSubtitle}>
            Enter your PIP access token to view the CAM Library
          </Text>
          <TextInput
            style={s.tokenInput}
            placeholder="Paste your PIP token..."
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error && <Text style={s.errorText}>{error}</Text>}
          <Pressable
            style={[s.tokenButton, validating && { opacity: 0.6 }]}
            onPress={validateAndSave}
            disabled={validating || !tokenInput.trim()}
          >
            {validating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.tokenButtonText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─── Render: Loading ──────────────────────────────────────────────
  if (loading && !handbook) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading CAM Library...</Text>
      </View>
    );
  }

  if (!handbook) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.error, fontSize: 15 }}>{error || "Failed to load"}</Text>
        <Pressable style={s.retryBtn} onPress={loadAll}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // ─── Render: Main PIP ─────────────────────────────────────────────
  let sectionCounter = 0;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>NEXUS PIP</Text>
          <Text style={s.headerSub}>
            {handbook.totalCams} CAMs · {handbook.modules.length} Modules
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setFavoritesOnly(!favoritesOnly)}
            style={[s.headerBtn, favoritesOnly && { backgroundColor: "#fef3c7" }]}
          >
            <Text>{favoritesOnly ? "⭐" : "☆"}</Text>
          </Pressable>
          <Pressable onPress={handleLogout} style={s.headerBtn}>
            <Text style={{ fontSize: 12 }}>✕</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Announcements */}
        {announcements.length > 0 && (
          <View style={s.announcementSection}>
            <Pressable
              onPress={() => setShowAnnouncements(!showAnnouncements)}
              style={s.announcementHeader}
            >
              <Text style={s.announcementHeaderText}>
                📢 Announcements ({announcements.length})
              </Text>
              <Text>{showAnnouncements ? "▾" : "▸"}</Text>
            </Pressable>
            {showAnnouncements && announcements.map((a) => (
              <View
                key={a.id}
                style={[
                  s.announcementCard,
                  a.priority === "URGENT" && { borderLeftColor: "#dc2626" },
                ]}
              >
                <Text style={s.announcementTitle}>
                  {a.priority === "URGENT" ? "🔴 " : ""}{a.title}
                </Text>
                <Text style={s.announcementBody}>{a.body}</Text>
                <Text style={s.announcementMeta}>
                  {a.authorName} · {timeAgo(a.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Legend */}
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#fef9c3", borderColor: "#eab308" }]} />
            <Text style={s.legendText}>New</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" }]} />
            <Text style={s.legendText}>Read</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#dcfce7", borderColor: "#22c55e" }]} />
            <Text style={s.legendText}>Updated</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#fef3c7", borderColor: "#f59e0b" }]} />
            <Text style={s.legendText}>Favorite</Text>
          </View>
        </View>

        {/* Modules + CAMs */}
        {handbook.modules.map((mod) => {
          const icon = MODE_ICONS[mod.mode] || "📁";
          const filteredCams = favoritesOnly
            ? mod.cams.filter((c) => {
                const st = camStatuses.find((s) => s.camId === (c.camId || c.code));
                return st?.isFavorite;
              })
            : mod.cams;

          if (favoritesOnly && filteredCams.length === 0) return null;

          return (
            <View key={mod.mode} style={s.moduleSection}>
              {/* Module header */}
              <View style={s.moduleHeader}>
                <Text style={s.moduleIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.moduleTitle}>{mod.modeLabel}</Text>
                  <Text style={s.moduleSub}>
                    {filteredCams.length} CAM{filteredCams.length !== 1 ? "s" : ""} · avg {mod.aggregateScore}/40
                  </Text>
                </View>
              </View>

              {/* CAM rows */}
              {filteredCams.map((cam) => {
                sectionCounter++;
                const camKey = cam.camId || cam.code;
                const isExpanded = expandedCam === camKey;
                const isDiscExpanded = expandedDiscussion === camKey;
                const badgeBg = camBadgeColor(cam);
                const badgeBorder = camBadgeBorder(cam);
                const isFav = camStatuses.find((s) => s.camId === camKey)?.isFavorite;

                return (
                  <View key={cam.code} style={s.camRow}>
                    {/* CAM summary row */}
                    <Pressable
                      style={s.camSummary}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setExpandedCam(isExpanded ? null : camKey);
                        if (!isExpanded) markCamRead(camKey);
                      }}
                    >
                      <View
                        style={[
                          s.badge,
                          { backgroundColor: badgeBg, borderColor: badgeBorder },
                        ]}
                      >
                        <Text style={{ fontSize: 11 }}>💬</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.camCode}>{camKey}</Text>
                        <Text style={s.camTitle} numberOfLines={2}>
                          {cam.title}
                        </Text>
                      </View>
                      <Text style={[s.camScore, { color: scoreColor(cam.scores.total) }]}>
                        {cam.scores.total}
                      </Text>
                    </Pressable>

                    {/* Expanded CAM content */}
                    {isExpanded && (
                      <View style={s.camExpanded}>
                        {/* Toolbar */}
                        <View style={s.camToolbar}>
                          <Pressable
                            onPress={() => toggleFavorite(camKey)}
                            style={s.toolbarBtn}
                          >
                            <Text>{isFav ? "⭐" : "☆"} Fav</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => toggleDiscussion(camKey)}
                            style={[s.toolbarBtn, isDiscExpanded && { backgroundColor: "#dbeafe" }]}
                          >
                            <Text>💬 Discuss</Text>
                          </Pressable>
                        </View>

                        {/* Score details */}
                        <View style={s.scoreRow}>
                          <Text style={s.scoreDetail}>
                            {cam.scores.total}/40 {scoreTier(cam.scores.total)}
                          </Text>
                          <Text style={s.scoreSub}>
                            U:{cam.scores.uniqueness} V:{cam.scores.value} D:{cam.scores.demonstrable} Df:{cam.scores.defensible}
                          </Text>
                          <Text style={s.scoreSub}>
                            {CATEGORY_LABELS[cam.category] || cam.category}
                          </Text>
                        </View>

                        {/* Content (plain text — no WebView needed) */}
                        <Text style={s.camContent}>
                          {stripHtml(cam.htmlContent || cam.htmlBody || "")}
                        </Text>

                        {/* Discussion panel */}
                        {isDiscExpanded && (
                          <View style={s.discussionPanel}>
                            <Text style={s.discHeader}>Discussion — {camKey}</Text>

                            {threadsLoading ? (
                              <ActivityIndicator style={{ marginVertical: 12 }} />
                            ) : activeThread ? (
                              /* Thread detail view */
                              <View>
                                <Pressable onPress={() => { setActiveThread(null); setMessages([]); }}>
                                  <Text style={s.discBack}>← Back to threads</Text>
                                </Pressable>
                                {msgsLoading ? (
                                  <ActivityIndicator style={{ marginVertical: 8 }} />
                                ) : (
                                  messages.map((m) => (
                                    <View key={m.id} style={s.msgBubble}>
                                      <Text style={s.msgAuthor}>{m.author.name}</Text>
                                      <Text style={s.msgBody}>{m.body}</Text>
                                      <Text style={s.msgTime}>{timeAgo(m.createdAt)}</Text>
                                    </View>
                                  ))
                                )}
                                <View style={s.replyRow}>
                                  <TextInput
                                    style={s.replyInput}
                                    placeholder="Reply..."
                                    value={replyBody}
                                    onChangeText={setReplyBody}
                                    multiline
                                  />
                                  <Pressable
                                    onPress={() => handleReply(activeThread)}
                                    disabled={!replyBody.trim() || replying}
                                    style={[s.replyBtn, !replyBody.trim() && { opacity: 0.5 }]}
                                  >
                                    <Text style={s.replyBtnText}>
                                      {replying ? "..." : "Send"}
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            ) : (
                              /* Thread list view */
                              <View>
                                {threads.length === 0 && (
                                  <Text style={s.discEmpty}>No discussions yet.</Text>
                                )}
                                {threads.map((t) => (
                                  <Pressable
                                    key={t.id}
                                    style={s.threadRow}
                                    onPress={() => {
                                      setActiveThread(t.id);
                                      loadMessages(t.id);
                                    }}
                                  >
                                    <Text style={s.threadTitle}>
                                      {t.isPinned ? "📌 " : ""}{t.title}
                                    </Text>
                                    <Text style={s.threadMeta}>
                                      {t.messageCount} msg · {t.createdBy.name} · {timeAgo(t.updatedAt)}
                                    </Text>
                                    {t.lastMessage && (
                                      <Text style={s.threadPreview} numberOfLines={1}>
                                        {t.lastMessage.authorName}: {t.lastMessage.preview}
                                      </Text>
                                    )}
                                  </Pressable>
                                ))}

                                {/* New thread form */}
                                {showNewThread ? (
                                  <View style={s.newThreadForm}>
                                    <TextInput
                                      style={s.newThreadInput}
                                      placeholder="Thread title"
                                      value={newTitle}
                                      onChangeText={setNewTitle}
                                    />
                                    <TextInput
                                      style={[s.newThreadInput, { minHeight: 60 }]}
                                      placeholder="Your message..."
                                      value={newBody}
                                      onChangeText={setNewBody}
                                      multiline
                                    />
                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                      <Pressable
                                        onPress={() => handleCreateThread(camKey)}
                                        disabled={!newTitle.trim() || !newBody.trim() || creating}
                                        style={[s.replyBtn, (!newTitle.trim() || !newBody.trim()) && { opacity: 0.5 }]}
                                      >
                                        <Text style={s.replyBtnText}>
                                          {creating ? "..." : "Post"}
                                        </Text>
                                      </Pressable>
                                      <Pressable
                                        onPress={() => { setShowNewThread(false); setNewTitle(""); setNewBody(""); }}
                                        style={s.cancelBtn}
                                      >
                                        <Text style={{ fontSize: 12 }}>Cancel</Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                ) : (
                                  <Pressable
                                    onPress={() => setShowNewThread(true)}
                                    style={s.newThreadBtn}
                                  >
                                    <Text style={s.newThreadBtnText}>+ Start a Discussion</Text>
                                  </Pressable>
                                )}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            CONFIDENTIAL — Nexus Group LLC — Serial: {handbook._shareContext.serialNumber}
          </Text>
          <Text style={s.footerText}>
            {handbook.totalCams} CAMs · {handbook.modules.length} Modules · Visit #{handbook._shareContext.visitNumber}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },

  // Token entry
  tokenEntry: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  tokenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 8,
  },
  tokenSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  tokenInput: {
    width: "100%",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: "#fff",
    fontSize: 14,
    marginBottom: 12,
  },
  tokenButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginTop: 4,
  },
  tokenButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: 8,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0f172a",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Announcements
  announcementSection: {
    margin: 12,
    marginBottom: 4,
  },
  announcementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  announcementHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  announcementCard: {
    backgroundColor: "#fff",
    padding: 12,
    marginTop: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  announcementBody: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  announcementMeta: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 6,
  },

  // Legend
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 10,
    color: "#6b7280",
  },

  // Module
  moduleSection: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  moduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  moduleIcon: {
    fontSize: 22,
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  moduleSub: {
    fontSize: 11,
    color: "#6b7280",
  },

  // CAM row
  camRow: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 6,
    overflow: "hidden",
  },
  camSummary: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  camCode: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#6b7280",
  },
  camTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 17,
  },
  camScore: {
    fontSize: 16,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "right",
  },

  // Expanded CAM
  camExpanded: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    padding: 12,
  },
  camToolbar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  toolbarBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  scoreRow: {
    marginBottom: 10,
  },
  scoreDetail: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  scoreSub: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  camContent: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },

  // Discussion
  discussionPanel: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  discHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  discEmpty: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 12,
  },
  discBack: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "600",
    marginBottom: 8,
  },
  threadRow: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  threadTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  threadMeta: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
  },
  threadPreview: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    fontStyle: "italic",
  },
  msgBubble: {
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  msgAuthor: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
  },
  msgBody: {
    fontSize: 13,
    color: "#374151",
    marginTop: 2,
  },
  msgTime: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 4,
  },
  replyRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    alignItems: "flex-end",
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    backgroundColor: "#fff",
    maxHeight: 80,
  },
  replyBtn: {
    backgroundColor: "#0f172a",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  replyBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
  },
  newThreadBtn: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  newThreadBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3b82f6",
  },
  newThreadForm: {
    marginTop: 8,
    gap: 6,
  },
  newThreadInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    backgroundColor: "#fff",
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 10,
    color: "#9ca3af",
    textAlign: "center",
  },
});
