"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/* ── Types ─────────────────────────────────────────────── */

interface TaskUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface TaskProject {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate: string | null;
  projectId: string;
  assigneeId: string | null;
  assignee: TaskUser | null;
  createdBy: TaskUser | null;
  project: TaskProject | null;
  createdAt: string;
}

interface ProjectFileDto {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string;
  createdAt: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

/* ── Style constants ───────────────────────────────────── */

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  TODO: { bg: "#f3f4f6", color: "#374151", label: "To Do" },
  IN_PROGRESS: { bg: "#dbeafe", color: "#1e40af", label: "In Progress" },
  BLOCKED: { bg: "#fee2e2", color: "#991b1b", label: "Blocked" },
  DONE: { bg: "#d1fae5", color: "#065f46", label: "Done" },
};

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  LOW: { color: "#9ca3af", label: "Low" },
  MEDIUM: { color: "#f59e0b", label: "Medium" },
  HIGH: { color: "#f97316", label: "High" },
  CRITICAL: { color: "#dc2626", label: "Critical" },
};

/* ── Page ──────────────────────────────────────────────── */

export default function TodosPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Files
  const [files, setFiles] = useState<ProjectFileDto[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Filters
  const [viewMode, setViewMode] = useState<"my" | "all">("my");
  const [filterProject, setFilterProject] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [searchText, setSearchText] = useState("");

  // Projects list for filter dropdown
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  /* ── Bootstrap auth + user id ──────────────────────── */

  useEffect(() => {
    if (typeof window === "undefined") return;
    const accessToken = localStorage.getItem("accessToken");
    setToken(accessToken);

    if (!accessToken) return;
    // Fetch current user id
    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: any) => {
        if (me?.id) setCurrentUserId(me.id);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch projects for filter ─────────────────────── */

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        setProjects(
          data.map((p) => ({ id: p.id, name: p.name }))
        );
      })
      .catch(() => {});
  }, [token]);

  /* ── Fetch tasks ───────────────────────────────────── */

  useEffect(() => {
    if (!token) return;
    setTasksLoading(true);
    setTasksError(null);

    const params = new URLSearchParams();
    if (filterProject) params.set("projectId", filterProject);
    if (filterStatus) params.set("status", filterStatus);
    if (filterPriority) params.set("priority", filterPriority);
    if (filterUser) params.set("assigneeId", filterUser);

    const qs = params.toString() ? `?${params.toString()}` : "";
    fetch(`${API_BASE}/tasks${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load tasks (${r.status})`);
        return r.json();
      })
      .then((data: Task[]) => {
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch((e: any) => {
        setTasksError(e?.message ?? "Failed to load tasks");
      })
      .finally(() => setTasksLoading(false));
  }, [token, filterProject, filterStatus, filterPriority, filterUser]);

  /* ── Fetch project files ───────────────────────────── */

  useEffect(() => {
    if (!token) return;
    const projectId =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("nexusActiveProjectId")
        : null;
    if (!projectId) return;

    setFilesLoading(true);
    fetch(`${API_BASE}/projects/${projectId}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any) => setFiles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setFilesLoading(false));
  }, [token]);

  /* ── Derived data ──────────────────────────────────── */

  // Unique assignees from fetched tasks (for the user dropdown)
  const availableUsers = useMemo(() => {
    const map = new Map<string, TaskUser>();
    tasks.forEach((t) => {
      if (t.assignee) map.set(t.assignee.id, t.assignee);
      if (t.createdBy) map.set(t.createdBy.id, t.createdBy);
    });
    return Array.from(map.values()).sort((a, b) =>
      displayName(a).localeCompare(displayName(b))
    );
  }, [tasks]);

  // Apply client-side view mode + text search
  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (viewMode === "my" && currentUserId) {
      list = list.filter((t) => t.assigneeId === currentUserId);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          (t.project?.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, viewMode, currentUserId, searchText]);

  const overdueCount = useMemo(() => {
    const now = new Date();
    return filteredTasks.filter(
      (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < now
    ).length;
  }, [filteredTasks]);

  /* ── Handlers ──────────────────────────────────────── */

  const handleTaskClick = useCallback(
    (task: Task) => {
      router.push(`/projects/${task.projectId}`);
    },
    [router]
  );

  const handleStatusToggle = useCallback(
    async (task: Task) => {
      if (!token) return;
      const nextStatus = task.status === "DONE" ? "TODO" : "DONE";
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
      );
      try {
        await fetch(`${API_BASE}/tasks/${task.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        });
      } catch {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: task.status } : t
          )
        );
      }
    },
    [token]
  );

  /* ── Render ────────────────────────────────────────── */

  if (!token) {
    return (
      <div className="app-card" style={{ textAlign: "center", padding: 40 }}>
        <p>Please log in to view your tasks.</p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <div
        className="app-card"
        style={{
          borderRadius: 0,
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Todos
          </h2>
          {overdueCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "#fee2e2",
                color: "#991b1b",
              }}
            >
              {overdueCount} overdue
            </span>
          )}
        </div>

        {/* View mode tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
          {(["my", "all"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: viewMode === mode ? 600 : 400,
                border: "1px solid #d1d5db",
                borderRight: mode === "my" ? "none" : "1px solid #d1d5db",
                borderRadius: mode === "my" ? "6px 0 0 6px" : "0 6px 6px 0",
                background: viewMode === mode ? "#2563eb" : "white",
                color: viewMode === mode ? "white" : "#374151",
                cursor: "pointer",
              }}
            >
              {mode === "my" ? "My Tasks" : "All Todos"}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search tasks..."
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13,
              width: 200,
            }}
          />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {viewMode === "all" && (
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              style={filterSelectStyle}
            >
              <option value="">All Users</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {displayName(u)}
                </option>
              ))}
            </select>
          )}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">All Statuses</option>
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="BLOCKED">Blocked</option>
            <option value="DONE">Done</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          {(filterProject || filterUser || filterStatus || filterPriority || searchText) && (
            <button
              onClick={() => {
                setFilterProject("");
                setFilterUser("");
                setFilterStatus("");
                setFilterPriority("");
                setSearchText("");
              }}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "white",
                fontSize: 12,
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              Clear Filters
            </button>
          )}
          <span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {/* ── Tasks list ─────────────────────────── */}
        {tasksLoading && (
          <div style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 13 }}>
            Loading tasks…
          </div>
        )}
        {tasksError && (
          <div
            className="app-card"
            style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 14, borderRadius: 8, marginBottom: 16 }}
          >
            <p style={{ color: "#991b1b", margin: 0, fontSize: 13 }}>Error: {tasksError}</p>
          </div>
        )}

        {!tasksLoading && !tasksError && filteredTasks.length === 0 && (
          <div className="app-card" style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 13 }}>
            {viewMode === "my" ? "No tasks assigned to you." : "No tasks found."}
          </div>
        )}

        {!tasksLoading && !tasksError && filteredTasks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
            {filteredTasks.map((task) => {
              const ss = STATUS_STYLE[task.status] || STATUS_STYLE.TODO;
              const ps = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.MEDIUM;
              const isOverdue =
                task.status !== "DONE" &&
                task.dueDate &&
                new Date(task.dueDate) < now;

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    fontSize: 13,
                    transition: "background 0.1s",
                  }}
                  onClick={() => handleTaskClick(task)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f9fafb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ffffff";
                  }}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusToggle(task);
                    }}
                    title={task.status === "DONE" ? "Mark as To Do" : "Mark as Done"}
                    style={{
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${task.status === "DONE" ? "#16a34a" : "#d1d5db"}`,
                      background: task.status === "DONE" ? "#16a34a" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      lineHeight: 1,
                      color: "white",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {task.status === "DONE" ? "✓" : ""}
                  </button>

                  {/* Priority dot */}
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: ps.color,
                    }}
                    title={ps.label}
                  />

                  {/* Title */}
                  <span
                    style={{
                      fontWeight: 600,
                      color: task.status === "DONE" ? "#9ca3af" : "#1f2937",
                      textDecoration: task.status === "DONE" ? "line-through" : "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 300,
                    }}
                  >
                    {task.title}
                  </span>

                  {/* Project name */}
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: "#6b7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 160,
                    }}
                  >
                    {task.project?.name || "—"}
                  </span>

                  {/* Status badge */}
                  <span
                    style={{
                      flexShrink: 0,
                      padding: "1px 6px",
                      borderRadius: 3,
                      fontSize: 11,
                      fontWeight: 500,
                      background: ss.bg,
                      color: ss.color,
                    }}
                  >
                    {ss.label}
                  </span>

                  {/* Priority label */}
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 600,
                      color: ps.color,
                    }}
                  >
                    {ps.label}
                  </span>

                  {/* Due date */}
                  {task.dueDate && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        color: isOverdue ? "#dc2626" : "#9ca3af",
                        fontWeight: isOverdue ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isOverdue ? "⚠ " : ""}
                      {new Date(task.dueDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}

                  {/* Flex spacer */}
                  <span style={{ flex: 1 }} />

                  {/* Assignee */}
                  {task.assignee && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        color: "#9ca3af",
                        whiteSpace: "nowrap",
                      }}
                    >
                      → {displayName(task.assignee)}
                    </span>
                  )}

                  {/* Created date */}
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: "#9ca3af",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(task.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Project Files section ──────────────── */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#374151" }}>
            Project Files
          </h3>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
            Files uploaded from Daily Logs and other uploads for your currently selected project.
          </p>

          {filesLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading files…</p>
          )}

          {!filesLoading && files.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>
              No project files found. Upload attachments from Daily Logs or other tools, and they'll appear here.
            </p>
          )}

          {!filesLoading && files.length > 0 && (
            <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                overflow: "hidden",
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "6px 8px",
                  backgroundColor: "#f9fafb",
                  fontWeight: 500,
                }}
              >
                <span>Name</span>
                <span>Type</span>
                <span>Size</span>
                <span>Uploaded</span>
              </div>
              {files.map((f) => {
                const sizeLabel =
                  typeof f.sizeBytes === "number" && f.sizeBytes >= 0
                    ? `${(f.sizeBytes / 1024).toFixed(1)} KB`
                    : "—";
                return (
                  <div
                    key={f.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr",
                      padding: "6px 8px",
                      borderTop: "1px solid #f3f4f6",
                    }}
                  >
                    <span>
                      <a
                        href={f.storageUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {f.fileName}
                      </a>
                    </span>
                    <span>{f.mimeType || "Unknown"}</span>
                    <span>{sizeLabel}</span>
                    <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────── */

function displayName(u: { firstName: string | null; lastName: string | null; email: string }) {
  if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
  if (u.firstName) return u.firstName;
  if (u.lastName) return u.lastName;
  return u.email.split("@")[0];
}

const filterSelectStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  backgroundColor: "white",
  cursor: "pointer",
};
