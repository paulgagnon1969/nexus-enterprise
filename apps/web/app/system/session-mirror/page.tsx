"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("accessToken")
    : null;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers as Record<string, string>) },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ── Types ──────────────────────────────────────────────────────────── */

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

/* ── Helpers ─────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: "#059669", bg: "#d1fae5", label: "Active" },
  PAUSED: { color: "#6b7280", bg: "#f3f4f6", label: "Paused" },
  AWAITING_REVIEW: { color: "#d97706", bg: "#fef3c7", label: "Awaiting Review" },
  COMPLETED: { color: "#3b82f6", bg: "#dbeafe", label: "Completed" },
  CANCELLED: { color: "#dc2626", bg: "#fee2e2", label: "Cancelled" },
};

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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elapsedTime(startStr: string): string {
  const diff = Date.now() - new Date(startStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/* ═══════════════════════════════════════════════════════════════════════
 *  MAIN PAGE — two-column layout: session list (left) + detail (right)
 * ═══════════════════════════════════════════════════════════════════════ */

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/** Request browser notification permission on first load. */
function useBrowserNotifications() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
}

/** Fire a browser notification (works even when tab is in background). */
function showBrowserNotification(title: string, body: string) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    /* ignore — some browsers block from non-interaction context */
  }
}

export default function SessionMirrorPage() {
  const [sessions, setSessions] = useState<DevSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Load sessions ──
  const loadSessions = useCallback(async (q?: string) => {
    try {
      setError(null);
      const url = q ? `/dev-session?q=${encodeURIComponent(q)}` : "/dev-session";
      const data = await api<DevSession[]>(url);
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        loadSessions(text.trim() || undefined);
      }, 400);
    },
    [loadSessions],
  );

  // Browser notification permission
  useBrowserNotifications();

  // Poll every 15s
  useEffect(() => {
    loadSessions();
    const iv = setInterval(() => loadSessions(), 15000);
    return () => clearInterval(iv);
  }, [loadSessions]);

  // ── Create session ──
  const handleCreate = async () => {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const session = await api<DevSession>("/dev-session", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
        }),
      });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setSelectedId(session.id);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: "12px 16px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>🔭 Session Mirror</h1>
          <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>
            Dev oversight — real-time session monitoring
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sessions.length > 0 && (
            <span
              style={{
                background: "#0f172a",
                color: "#f9fafb",
                padding: "2px 10px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {sessions.length}
            </span>
          )}
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              padding: "4px 14px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: showCreate ? "#fee2e2" : "#0f172a",
              color: showCreate ? "#dc2626" : "#f9fafb",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showCreate ? "✕ Cancel" : "+ New Session"}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            padding: 12,
            background: "#f9fafb",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            placeholder="Session title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim() || creating}
            style={{
              padding: "8px 18px",
              borderRadius: 6,
              border: "none",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 13,
              fontWeight: 600,
              cursor: !newTitle.trim() || creating ? "not-allowed" : "pointer",
              opacity: !newTitle.trim() || creating ? 0.5 : 1,
            }}
          >
            {creating ? "Creating…" : "Start Session"}
          </button>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: "flex", flex: 1, gap: 12, minHeight: 0 }}>
        {/* Left: Session list */}
        <div
          style={{
            width: 380,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>
            <input
              type="text"
              placeholder="Search sessions…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 13 }}>
                Loading sessions…
              </div>
            ) : error ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{error}</div>
                <button
                  onClick={() => loadSessions()}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 6,
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#f9fafb",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔭</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  No dev sessions yet
                </div>
                <div style={{ fontSize: 12 }}>
                  Click &quot;+ New Session&quot; to start one
                </div>
              </div>
            ) : (
              sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isSelected={s.id === selectedId}
                  onClick={() => setSelectedId(s.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Detail pane */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {selectedSession ? (
            <SessionDetail
              session={selectedSession}
              onRefreshList={loadSessions}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔭</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                Select a session
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Choose a session from the list to view its event feed
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  SESSION CARD — list item
 * ═══════════════════════════════════════════════════════════════════════ */

function SessionCard({
  session,
  isSelected,
  onClick,
}: {
  session: DevSession;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.ACTIVE;
  const isActive = session.status === "ACTIVE";
  const pendingApprovals = session._count?.approvals ?? 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 12,
        marginBottom: 6,
        borderRadius: 8,
        border: isSelected
          ? "2px solid #0f172a"
          : isActive
            ? "1.5px solid #059669"
            : "1px solid #e5e7eb",
        background: isSelected ? "#f0f9ff" : "#fff",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      {/* Status + code */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 10,
            background: config.bg,
            color: config.color,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {isActive && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: config.color,
                display: "inline-block",
              }}
            />
          )}
          {config.label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#9ca3af",
            fontFamily: "monospace",
            letterSpacing: 1,
          }}
        >
          {session.sessionCode}
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
          marginBottom: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {session.title}
      </div>

      {/* Description */}
      {session.description && (
        <div
          style={{
            fontSize: 12,
            color: "#6b7280",
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.description}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "#9ca3af",
        }}
      >
        <span>
          {timeAgo(session.updatedAt ?? session.createdAt)}
          {session._count?.events ? ` · ${session._count.events} events` : ""}
        </span>
        {pendingApprovals > 0 && (
          <span
            style={{
              background: "#fef3c7",
              color: "#d97706",
              padding: "1px 6px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {pendingApprovals} pending
          </span>
        )}
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  SESSION DETAIL — event feed + comment input
 * ═══════════════════════════════════════════════════════════════════════ */

function SessionDetail({
  session,
  onRefreshList,
}: {
  session: DevSession;
  onRefreshList: () => void;
}) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [idle, setIdle] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  const loadEvents = useCallback(async () => {
    try {
      const data = await api<SessionEvent[]>(
        `/dev-session/${session.id}/events?take=100`,
      );
      const reversed = data.reverse(); // oldest-first (chat style)

      // Fire browser notification for genuinely new events (not initial load)
      if (seenEventIdsRef.current.size > 0) {
        for (const ev of reversed) {
          if (!seenEventIdsRef.current.has(ev.id) && ev.actorUser) {
            const name =
              `${ev.actorUser.firstName ?? ""} ${ev.actorUser.lastName ?? ""}`.trim() || "User";
            showBrowserNotification(
              `🔭 ${name}`,
              ev.summary,
            );
          }
        }
      }
      // Track all seen event IDs
      for (const ev of reversed) {
        seenEventIdsRef.current.add(ev.id);
      }

      setEvents(reversed);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  // ── Idle timer ──
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (idle) {
      setIdle(false);
      loadEvents();
      intervalRef.current = setInterval(loadEvents, 5000);
    }
    idleTimerRef.current = setTimeout(() => {
      setIdle(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, IDLE_TIMEOUT_MS);
  }, [idle, loadEvents]);

  // ── Poll events ──
  useEffect(() => {
    setLoading(true);
    setEvents([]);
    setIdle(false);
    loadEvents();
    intervalRef.current = setInterval(loadEvents, 5000);

    idleTimerRef.current = setTimeout(() => {
      setIdle(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, IDLE_TIMEOUT_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [session.id, loadEvents]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current && events.length > 0) {
      setTimeout(() => {
        feedRef.current?.scrollTo({
          top: feedRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  }, [events.length]);

  // ── Send comment ──
  const handleSendComment = async () => {
    if (!comment.trim() || sending) return;
    setSending(true);
    try {
      await api(`/dev-session/${session.id}/comment`, {
        method: "POST",
        body: JSON.stringify({ text: comment.trim() }),
      });
      setComment("");
      await loadEvents();
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  // ── Approve / reject ──
  const handleApprove = async (approvalId: string) => {
    try {
      await api(`/dev-session/approval-requests/${approvalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "APPROVED" }),
      });
      await loadEvents();
      onRefreshList();
    } catch {
      /* ignore */
    }
  };

  const handleReject = async (approvalId: string) => {
    const reason = window.prompt("Reject reason (optional):");
    try {
      await api(`/dev-session/approval-requests/${approvalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "REJECTED",
          comment: reason || undefined,
        }),
      });
      await loadEvents();
      onRefreshList();
    } catch {
      /* ignore */
    }
  };

  const isActive =
    session.status === "ACTIVE" || session.status === "AWAITING_REVIEW";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
      onMouseMove={idle ? undefined : resetIdleTimer}
      onClick={idle ? resetIdleTimer : undefined}
    >
      {/* Detail header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#0f172a",
          color: "#f9fafb",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{session.title}</div>
            <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
              {session.sessionCode}
              {session.startedAt && <> · {elapsedTime(session.startedAt)}</>}
            </div>
          </div>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              background:
                (STATUS_CONFIG[session.status] ?? STATUS_CONFIG.ACTIVE).bg,
              color:
                (STATUS_CONFIG[session.status] ?? STATUS_CONFIG.ACTIVE).color,
            }}
          >
            {(STATUS_CONFIG[session.status] ?? STATUS_CONFIG.ACTIVE).label}
          </span>
        </div>
      </div>

      {/* Idle overlay */}
      {idle && (
        <div
          onClick={resetIdleTimer}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15,23,42,0.05)",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 8 }}>💤</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Session idle
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Click anywhere to resume live feed
          </div>
        </div>
      )}

      {/* Event feed */}
      {!idle && loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
            fontSize: 13,
          }}
        >
          Loading events…
        </div>
      ) : !idle ? (
        <div
          ref={feedRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px",
          }}
        >
          {events.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: 40,
                color: "#9ca3af",
                fontSize: 13,
              }}
            >
              No events yet — activity will appear here in real time
            </div>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}
        </div>
      ) : null}

      {/* Comment input */}
      {isActive && !idle && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 16px",
            borderTop: "1px solid #e5e7eb",
            background: "#f9fafb",
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            placeholder="Send a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleSendComment}
            disabled={!comment.trim() || sending}
            style={{
              padding: "8px 18px",
              borderRadius: 6,
              border: "none",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 13,
              fontWeight: 600,
              cursor:
                !comment.trim() || sending ? "not-allowed" : "pointer",
              opacity: !comment.trim() || sending ? 0.5 : 1,
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  EVENT CARD — individual event in the feed
 * ═══════════════════════════════════════════════════════════════════════ */

function EventCard({
  event,
  onApprove,
  onReject,
}: {
  event: SessionEvent;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const icon = EVENT_ICONS[event.eventType] ?? "📌";
  const bg = EVENT_BG[event.eventType] ?? "#f9fafb";
  const isApprovalPending =
    event.eventType === "APPROVAL_REQUESTED" &&
    event.approval?.status === "PENDING";
  const actorName = event.actorUser
    ? `${event.actorUser.firstName ?? ""} ${event.actorUser.lastName ?? ""}`.trim() ||
      "User"
    : "Agent";

  return (
    <div
      style={{
        padding: "10px 12px",
        marginBottom: 6,
        borderRadius: 8,
        background: bg,
        border: isApprovalPending
          ? "1.5px solid #f59e0b"
          : "1px solid #e5e7eb",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span>{icon}</span>
        <span style={{ fontWeight: 600, color: "#0f172a" }}>{actorName}</span>
        <span style={{ color: "#9ca3af", marginLeft: "auto" }}>
          {formatTime(event.createdAt)}
        </span>
      </div>

      {/* Summary */}
      <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5 }}>
        {event.summary}
      </div>

      {/* File change diff preview */}
      {event.eventType === "FILE_CHANGED" && event.detail?.filePath && (
        <div
          style={{
            marginTop: 6,
            padding: "4px 8px",
            borderRadius: 4,
            background: "#1e293b",
            color: "#e2e8f0",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {event.detail.filePath}
          {event.detail.linesAdded != null && (
            <span style={{ marginLeft: 8 }}>
              <span style={{ color: "#4ade80" }}>
                +{event.detail.linesAdded}
              </span>
              {" / "}
              <span style={{ color: "#f87171" }}>
                -{event.detail.linesRemoved ?? 0}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Command preview */}
      {event.eventType === "COMMAND_RUN" && event.detail?.command && (
        <div
          style={{
            marginTop: 6,
            padding: "4px 8px",
            borderRadius: 4,
            background: "#1e293b",
            color: "#e2e8f0",
            fontSize: 11,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          $ {event.detail.command}
        </div>
      )}

      {/* Approval actions */}
      {isApprovalPending && event.approval && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            onClick={() => onApprove(event.approval!.id)}
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onReject(event.approval!.id)}
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "1px solid #dc2626",
              background: "#fff",
              color: "#dc2626",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}
