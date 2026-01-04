"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ThreadDto {
  id: string;
  subject?: string | null;
  createdAt?: string;
  updatedAt?: string;
  participants?: {
    id: string;
    userId?: string | null;
    email?: string | null;
    displayName?: string | null;
    isExternal?: boolean;
  }[];
}

interface MessageDto {
  id: string;
  body: string;
  createdAt?: string;
  senderId?: string | null;
  senderEmail?: string | null;
}

interface ThreadWithMessages extends ThreadDto {
  messages?: MessageDto[];
}

export default function MessagingPage() {
  const [threads, setThreads] = useState<ThreadDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadWithMessages | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function loadThreads() {
      try {
        setLoadingThreads(true);
        setError(null);
        const res = await fetch(`${API_BASE}/messages/threads`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load threads (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        setThreads(Array.isArray(json) ? json : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load threads");
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    }

    void loadThreads();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedThread(null);
      return;
    }
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    async function loadThread() {
      try {
        setLoadingThread(true);
        const res = await fetch(`${API_BASE}/messages/threads/${selectedId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load thread (${res.status})`);
        }
        const json = (await res.json()) as ThreadWithMessages;
        if (cancelled) return;
        setSelectedThread(json);
      } catch {
        if (!cancelled) setSelectedThread(null);
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleCreateThread(ev: React.FormEvent) {
    ev.preventDefault();
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    if (!newBody.trim()) return;

    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/messages/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: newSubject.trim() || null,
          body: newBody.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create thread (${res.status})`);
      }
      setNewSubject("");
      setNewBody("");

      const threadsRes = await fetch(`${API_BASE}/messages/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadsRes.ok) {
        const json: any[] = await threadsRes.json();
        setThreads(Array.isArray(json) ? json : []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create thread");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendReply(ev: React.FormEvent) {
    ev.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setSendingReply(true);
      const res = await fetch(`${API_BASE}/messages/threads/${selectedId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!res.ok) {
        throw new Error(`Failed to send message (${res.status})`);
      }
      setReplyBody("");

      const threadRes = await fetch(`${API_BASE}/messages/threads/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadRes.ok) {
        const json = (await threadRes.json()) as ThreadWithMessages;
        setSelectedThread(json);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to send message");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", gap: 12, minHeight: 400 }}>
        <div style={{ flex: "0 0 260px", borderRight: "1px solid #e5e7eb", paddingRight: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Messaging</h2>
          {error && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
          )}

          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <form onSubmit={handleCreateThread} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                type="text"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Subject (optional)"
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Start a new conversation"
                rows={3}
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                }}
              />
              <button
                type="submit"
                disabled={creating || !newBody.trim()}
                style={{
                  alignSelf: "flex-end",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "none",
                  background: creating ? "#9ca3af" : "#16a34a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: creating ? "default" : "pointer",
                }}
              >
                {creating ? "Sending..." : "Send"}
              </button>
            </form>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Recent threads</div>
          {loadingThreads && !threads && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading…</p>
          )}
          {threads && threads.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>No conversations yet.</p>
          )}
          {threads && threads.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
              {threads.map(t => {
                const updated = t.updatedAt ? new Date(t.updatedAt) : null;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "none",
                        backgroundColor: selectedId === t.id ? "#e5f2ff" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {t.subject || "(no subject)"}
                      </div>
                      {updated && (
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {updated.toLocaleString()}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {selectedId && loadingThread && !selectedThread && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading conversation…</p>
          )}

          {!selectedId && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Select a conversation on the left or start a new one.
            </p>
          )}

          {selectedThread && (
            <>
              <header style={{ marginBottom: 8 }}>
                <h3 style={{ marginTop: 0, marginBottom: 2, fontSize: 15 }}>
                  {selectedThread.subject || "(no subject)"}
                </h3>
              </header>

              <div
                style={{
                  flex: 1,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 8,
                  overflowY: "auto",
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                {selectedThread.messages && selectedThread.messages.length > 0 ? (
                  selectedThread.messages.map(m => {
                    const ts = m.createdAt ? new Date(m.createdAt) : null;
                    return (
                      <div key={m.id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {ts ? ts.toLocaleString() : ""}
                        </div>
                        <div>{m.body}</div>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>No messages yet.</p>
                )}
              </div>

              <form onSubmit={handleSendReply} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="Type a reply"
                  rows={3}
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    resize: "vertical",
                  }}
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyBody.trim()}
                  style={{
                    alignSelf: "flex-end",
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "none",
                    background: sendingReply ? "#9ca3af" : "#16a34a",
                    color: "#f9fafb",
                    fontSize: 12,
                    cursor: sendingReply ? "default" : "pointer",
                  }}
                >
                  {sendingReply ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PageCard>
  );
}
