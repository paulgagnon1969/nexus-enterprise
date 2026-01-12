"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type NttSubjectType =
  | "APPLICATION_QUESTION"
  | "APPLICATION_FAILURE"
  | "UI_IMPROVEMENT"
  | "OTHER";

type NttStatus =
  | "NEW"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING_ON_USER"
  | "RESOLVED"
  | "CLOSED"
  | "DEFERRED";

interface NttTicketDto {
  id: string;
  companyId: string;
  initiatorUserId: string;
  subjectType: NttSubjectType;
  summary: string;
  description: string;
  status: NttStatus;
  severity?: string | null;
  pagePath?: string | null;
  pageLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
}

interface TaskDto {
  id: string;
  title: string;
  description?: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  createdAt?: string;
}

interface MessageAttachmentDto {
  id: string;
  url: string;
  filename?: string | null;
}

interface MessageDto {
  id: string;
  body: string;
  createdAt?: string;
  attachments?: MessageAttachmentDto[];
}

export default function NttDashboardPage() {
  const [tickets, setTickets] = useState<NttTicketDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<NttTicketDto | null>(null);
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");

  const [messages, setMessages] = useState<MessageDto[] | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [globalRole, setGlobalRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load cached globalRole to decide if this user is a Nexus System role.
    try {
      const storedGlobalRole = window.localStorage.getItem("globalRole");
      if (storedGlobalRole) {
        setGlobalRole(storedGlobalRole);
      }
    } catch {
      // ignore
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function loadTickets() {
      try {
        setLoading(true);
        setError(null);
        const qs = mineOnly ? "?mineOnly=1" : "";
        const res = await fetch(`${API_BASE}/ntt${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load NTT tickets (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        setTickets(Array.isArray(json) ? json : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load NTT tickets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [mineOnly]);

  const isNexusSystem = globalRole === "SUPER_ADMIN" || globalRole === "SUPPORT";

  async function loadTasksForTicket(ticket: NttTicketDto) {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    setLoadingTasks(true);
    setTaskError(null);
    try {
      const res = await fetch(`${API_BASE}/ntt/${ticket.id}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load tasks (${res.status})`);
      }
      const json: any[] = await res.json();
      setTasks(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setTaskError(e?.message ?? "Failed to load tasks");
      setTasks(null);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function loadMessagesForTicket(ticket: NttTicketDto) {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    setLoadingMessages(true);
    setMessagesError(null);
    try {
      const res = await fetch(`${API_BASE}/ntt/${ticket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load messages (${res.status})`);
      }
      const json: any = await res.json();
      const msgs: any[] = Array.isArray(json?.messages) ? json.messages : [];
      setMessages(msgs);
    } catch (e: any) {
      setMessagesError(e?.message ?? "Failed to load messages");
      setMessages(null);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSelectTicket(ticket: NttTicketDto) {
    setSelectedTicket(ticket);
    void loadTasksForTicket(ticket);
    void loadMessagesForTicket(ticket);
  }

  async function handleUpdateStatus(ticket: NttTicketDto, nextStatus: NttStatus) {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    setUpdatingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(`${API_BASE}/ntt/${ticket.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update status (${res.status})`);
      }
      const updated: NttTicketDto = await res.json();

      // Update list state
      setTickets(prev =>
        prev ? prev.map(t => (t.id === ticket.id ? { ...t, ...updated } : t)) : prev,
      );
      setSelectedTicket(prev => (prev && prev.id === ticket.id ? { ...prev, ...updated } : prev));
    } catch (e: any) {
      setStatusError(e?.message ?? "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  function renderStatusActions(ticket: NttTicketDto) {
    if (!isNexusSystem) return null;

    const options: NttStatus[] = [
      "NEW",
      "TRIAGED",
      "IN_PROGRESS",
      "WAITING_ON_USER",
      "RESOLVED",
      "CLOSED",
      "DEFERRED",
    ];

    return (
      <select
        value={ticket.status}
        onChange={e => handleUpdateStatus(ticket, e.target.value as NttStatus)}
        disabled={updatingStatus}
        style={{
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 11,
        }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  function renderTaskSummary() {
    if (!tasks || tasks.length === 0) {
      if (loadingTasks) return <p style={{ fontSize: 12, color: "#6b7280" }}>Loading tasks…</p>;
      if (taskError) return <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {taskError}</p>;
      return <p style={{ fontSize: 12, color: "#6b7280" }}>No tasks linked to this ticket.</p>;
    }

    const open = tasks.filter(t => t.status !== "DONE").length;
    const done = tasks.filter(t => t.status === "DONE").length;

    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <strong>Tasks</strong> – {open} open / {done} done (total {tasks.length})
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 200, overflowY: "auto" }}>
          {tasks.map(t => (
            <li
              key={t.id}
              style={{
                padding: "4px 0",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{t.title}</div>
                  {t.description && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {t.description}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: 11 }}>
                  <div>{t.status}</div>
                  {t.dueDate && (
                    <div style={{ color: "#6b7280" }}>
                      Due {new Date(t.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderCreateTaskForm() {
    if (!selectedTicket || !isNexusSystem) return null;

    async function handleSubmit(ev: React.FormEvent) {
      ev.preventDefault();
      if (!taskTitle.trim()) return;
      if (!selectedTicket) return;
      if (typeof window === "undefined") return;
      const token = window.localStorage.getItem("accessToken");
      if (!token) return;

      setCreatingTask(true);
      setTaskError(null);
      try {
        const res = await fetch(`${API_BASE}/ntt/${selectedTicket.id}/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: taskTitle.trim(),
            description: taskDescription.trim() || undefined,
            priority: taskPriority,
            dueDate: taskDueDate || undefined,
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed to create task (${res.status})`);
        }
        const created: TaskDto = await res.json();
        setTasks(prev => (prev ? [...prev, created] : [created]));
        setTaskTitle("");
        setTaskDescription("");
        setTaskDueDate("");
        setTaskPriority("MEDIUM");
      } catch (e: any) {
        setTaskError(e?.message ?? "Failed to create task");
      } finally {
        setCreatingTask(false);
      }
    }

    return (
      <form onSubmit={handleSubmit} style={{ marginTop: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600 }}>Add task</div>
        <input
          type="text"
          value={taskTitle}
          onChange={e => setTaskTitle(e.target.value)}
          placeholder="Task title"
          style={{
            padding: "4px 6px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />
        <textarea
          value={taskDescription}
          onChange={e => setTaskDescription(e.target.value)}
          placeholder="Task description (optional)"
          rows={2}
          style={{
            padding: "4px 6px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <input
            type="date"
            value={taskDueDate}
            onChange={e => setTaskDueDate(e.target.value)}
            style={{
              flex: 1,
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          />
          <select
            value={taskPriority}
            onChange={e => setTaskPriority(e.target.value as any)}
            style={{
              flex: 1,
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creatingTask || !taskTitle.trim()}
          style={{
            alignSelf: "flex-start",
            marginTop: 4,
            padding: "4px 10px",
            borderRadius: 999,
            border: "none",
            backgroundColor: creatingTask ? "#9ca3af" : "#0f766e",
            color: "#f9fafb",
            fontSize: 12,
            cursor: creatingTask ? "default" : "pointer",
          }}
        >
          {creatingTask ? "Adding..." : "Add task"}
        </button>
      </form>
    );
  }

  function renderMessages() {
    if (!messages || messages.length === 0) {
      if (loadingMessages) return <p style={{ fontSize: 12, color: "#6b7280" }}>Loading messages…</p>;
      if (messagesError) return <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {messagesError}</p>;
      return <p style={{ fontSize: 12, color: "#6b7280" }}>No conversation yet.</p>;
    }

    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: 8,
          maxHeight: 220,
          overflowY: "auto",
          fontSize: 12,
        }}
      >
        {messages.map(m => {
          const ts = m.createdAt ? new Date(m.createdAt) : null;
          return (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {ts ? ts.toLocaleString() : ""}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  {m.attachments.map(att => {
                    const name = (att.filename || att.url || "").toLowerCase();
                    const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
                    if (isImage) {
                      return (
                        <div
                          key={att.id}
                          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
                        >
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                          >
                            <img
                              src={att.url}
                              alt={att.filename || "Screenshot"}
                              style={{
                                width: 80,
                                height: 80,
                                objectFit: "cover",
                                borderRadius: 6,
                                border: "1px solid #e5e7eb",
                                backgroundColor: "#f9fafb",
                              }}
                            />
                            <span style={{ color: "#2563eb", textDecoration: "underline" }}>
                              {att.filename || att.url}
                            </span>
                          </a>
                        </div>
                      );
                    }
                    return (
                      <div key={att.id}>
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#2563eb", textDecoration: "underline" }}
                        >
                          {att.filename || att.url}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDetailDrawer() {
    if (!selectedTicket) return null;

    const created = selectedTicket.createdAt ? new Date(selectedTicket.createdAt) : null;
    const updated = selectedTicket.updatedAt ? new Date(selectedTicket.updatedAt) : null;

    return (
      <div
        style={{
          position: "fixed",
          top: 64,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: "100%",
          background: "#ffffff",
          boxShadow: "-4px 0 16px rgba(15,23,42,0.18)",
          borderLeft: "1px solid #e5e7eb",
          padding: 16,
          zIndex: 950,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{selectedTicket.summary || "(no summary)"}</h3>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>#{selectedTicket.id}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              <span>{selectedTicket.subjectType}</span>
              {selectedTicket.pageLabel || selectedTicket.pagePath ? (
                <>
                  <span> • </span>
                  <span>{selectedTicket.pageLabel || selectedTicket.pagePath}</span>
                </>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div>
              <span
                style={{
                  display: "inline-flex",
                  padding: "2px 6px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#f3f4f6",
                  fontSize: 11,
                }}
              >
                {selectedTicket.status}
              </span>
            </div>
            {renderStatusActions(selectedTicket)}
            <button
              type="button"
              onClick={() => setSelectedTicket(null)}
              style={{
                marginTop: 4,
                border: "none",
                background: "transparent",
                color: "#6b7280",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </header>

        <section style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Description</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{selectedTicket.description}</div>
        </section>

        <section style={{ fontSize: 11, color: "#6b7280" }}>
          {created && <div>Created: {created.toLocaleString()}</div>}
          {updated && <div>Last updated: {updated.toLocaleString()}</div>}
          {selectedTicket.resolvedAt && (
            <div>Resolved: {new Date(selectedTicket.resolvedAt).toLocaleString()}</div>
          )}
        </section>

        <section>
          {renderTaskSummary()}
          {renderCreateTaskForm()}
        </section>

        <section style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Conversation</div>
          {renderMessages()}
        </section>

        {statusError && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>Status error: {statusError}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <PageCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Nexus Trouble Tickets</h2>
            <p style={{ margin: 0, marginTop: 4, fontSize: 12, color: "#6b7280" }}>
              Support dashboard for reviewing in-app questions, failures, and UI improvements.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={e => setMineOnly(e.target.checked)}
              />
              <span>Show only my tickets</span>
            </label>
          </div>
        </header>

        {error && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
        )}

        {loading && !tickets && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading tickets…</p>
        )}

        {tickets && tickets.length === 0 && !loading && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No NTT tickets found.</p>
        )}

        {tickets && tickets.length > 0 && (
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              overflow: "hidden",
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.7fr) minmax(0, 0.8fr)",
                padding: "6px 8px",
                backgroundColor: "#f9fafb",
                fontWeight: 600,
              }}
            >
              <div>Summary</div>
              <div>Type</div>
              <div>Status</div>
              <div>Page</div>
              <div>Created</div>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {tickets.map(t => {
                const created = t.createdAt ? new Date(t.createdAt) : null;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTicket(t)}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.7fr) minmax(0, 0.8fr)",
                      padding: "6px 8px",
                      borderTop: "1px solid #e5e7eb",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{t.summary || "(no summary)"}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>#{t.id}</div>
                    </div>
                    <div>{t.subjectType}</div>
                    <div>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          backgroundColor: "#f3f4f6",
                          fontSize: 11,
                        }}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div>
                      <div>{t.pageLabel || t.pagePath || "(n/a)"}</div>
                    </div>
                    <div>
                      {created ? created.toLocaleString() : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </PageCard>
      {renderDetailDrawer()}
    </>
  );
}
