"use client";

import React, { useCallback, useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; email: string } | null;
  assignedTo: { firstName: string; lastName: string; email: string } | null;
  _count: { sessions: number };
}

interface Session {
  id: string;
  sessionCode: string;
  status: string;
  mode: string;
  startedAt: string | null;
  endedAt: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string {
  return (
    (typeof window !== "undefined"
      ? localStorage.getItem("accessToken") || localStorage.getItem("token")
      : null) || ""
  );
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-slate-100 text-slate-500",
  PENDING: "bg-slate-100 text-slate-500",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ENDED: "bg-slate-100 text-slate-400",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create session flow
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeSession, setActiveSession] = useState<{
    code: string;
    ticketId: string;
    sessionId: string;
  } | null>(null);

  // Expanded ticket sessions
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [ticketSessions, setTicketSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Ticket[]>("/support/tickets?role=agent");
      setTickets(data);
    } catch (err: any) {
      setError(err.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleCreateSession = useCallback(async () => {
    if (!subject.trim()) return;
    setCreating(true);
    setError("");
    try {
      const ticket = await apiFetch<{ id: string }>("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), priority: "MEDIUM" }),
      });
      const session = await apiFetch<{ id: string; sessionCode: string }>(
        `/support/tickets/${ticket.id}/session`,
        { method: "POST" },
      );
      setActiveSession({
        code: session.sessionCode,
        ticketId: ticket.id,
        sessionId: session.id,
      });
      setSubject("");
      loadTickets();
    } catch (err: any) {
      setError(err.message || "Failed to create session");
    } finally {
      setCreating(false);
    }
  }, [subject, loadTickets]);

  const handleNewSessionForTicket = useCallback(
    async (ticketId: string) => {
      setCreating(true);
      setError("");
      try {
        const session = await apiFetch<{ id: string; sessionCode: string }>(
          `/support/tickets/${ticketId}/session`,
          { method: "POST" },
        );
        setActiveSession({
          code: session.sessionCode,
          ticketId,
          sessionId: session.id,
        });
      } catch (err: any) {
        setError(err.message || "Failed to create session");
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  const handleExpandTicket = useCallback(async (ticketId: string) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null);
      return;
    }
    setExpandedTicket(ticketId);
    setLoadingSessions(true);
    try {
      const t = await apiFetch<{ sessions: Session[] }>(
        `/support/tickets/${ticketId}`,
      );
      setTicketSessions(t.sessions || []);
    } catch {
      setTicketSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [expandedTicket]);

  const viewerUrl = (code: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/support/viewer?code=${code}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Remote Support</h1>
      <p className="mb-8 text-sm text-slate-500">
        Create a session to generate a code for the client, then open the viewer.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Active session code banner ─────────────────────────────────── */}
      {activeSession && (
        <div className="mb-8 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-6">
          <div className="mb-1 text-sm font-medium text-emerald-700">
            Session created — share this code with the client
          </div>
          <div className="mb-4 font-mono text-5xl font-black tracking-[0.3em] text-emerald-900">
            {activeSession.code}
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={viewerUrl(activeSession.code)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open Viewer →
            </a>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(activeSession.code);
              }}
              className="rounded-lg border border-emerald-300 bg-white px-5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Copy Code
            </button>
            <button
              onClick={() => setActiveSession(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Create new session ─────────────────────────────────────────── */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          New Support Session
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Session subject (e.g. Login issue, Screen share test)"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && subject.trim()) handleCreateSession();
            }}
          />
          <button
            onClick={handleCreateSession}
            disabled={!subject.trim() || creating}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Session"}
          </button>
        </div>
      </div>

      {/* ── Ticket list ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            All Tickets
          </h2>
          <button
            onClick={loadTickets}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No tickets yet. Create one above.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <div className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {ticket.subject}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[ticket.status] ?? "bg-slate-100 text-slate-500"}`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {ticket.createdBy
                        ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
                        : "Unknown"}{" "}
                      · {new Date(ticket.createdAt).toLocaleDateString()} ·{" "}
                      {ticket._count.sessions} session
                      {ticket._count.sessions !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleNewSessionForTicket(ticket.id)}
                      disabled={creating}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      + Session
                    </button>
                    <button
                      onClick={() => handleExpandTicket(ticket.id)}
                      className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {expandedTicket === ticket.id ? "Hide" : "Sessions"}
                    </button>
                  </div>
                </div>

                {/* Expanded sessions */}
                {expandedTicket === ticket.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                    {loadingSessions ? (
                      <p className="text-xs text-slate-400">Loading…</p>
                    ) : ticketSessions.length === 0 ? (
                      <p className="text-xs text-slate-400">No sessions yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {ticketSessions.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-base font-bold tracking-widest text-slate-800">
                                {s.sessionCode}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-500"}`}
                              >
                                {s.status}
                              </span>
                              <span className="text-xs text-slate-400">
                                {s.mode === "REMOTE_CONTROL"
                                  ? "🖱 Remote Control"
                                  : "👁 View Only"}
                              </span>
                            </div>
                            {s.status !== "ENDED" && (
                              <a
                                href={viewerUrl(s.sessionCode)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                Open Viewer →
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
