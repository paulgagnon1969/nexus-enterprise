"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

interface CreatedByUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface DailyLog {
  id: string;
  projectId: string;
  projectName: string;
  logDate: string;
  title: string | null;
  type: "PUDL" | "RECEIPT_EXPENSE" | "JSA" | "INCIDENT" | "QUALITY" | "TADL";
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  workPerformed: string | null;
  issues: string | null;
  crewOnSite: string | null;
  createdByUser: CreatedByUser;
  createdAt: string;
  attachments: Array<{
    id: string;
    fileName: string | null;
    fileUrl: string;
  }>;
}

interface DailyLogsResponse {
  items: DailyLog[];
  total: number;
  limit: number;
  offset: number;
}

interface Project {
  id: string;
  name: string;
  tenantClientId?: string | null;
  tenantClient?: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
  } | null;
}

const LOG_TYPE_LABELS: Record<DailyLog["type"], string> = {
  PUDL: "Daily Log",
  RECEIPT_EXPENSE: "Receipt/Expense",
  JSA: "Job Safety",
  INCIDENT: "Incident",
  QUALITY: "Quality",
  TADL: "Time Accounting",
};

const STATUS_COLORS: Record<DailyLog["status"], string> = {
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const CARD_HEIGHT = 160; // Approximate height of each log card in pixels

export default function ProjectsPage() {
  const router = useRouter();
  const { user, apiUrl } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  
  const [availableUsers, setAvailableUsers] = useState<CreatedByUser[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [availableClients, setAvailableClients] = useState<Array<{ id: string; name: string }>>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  const [startUiTransition] = useTransition();

  // Calculate items per page based on container height
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateItemsPerPage = () => {
      const containerHeight = containerRef.current?.clientHeight || 800;
      const calculated = Math.floor(containerHeight / CARD_HEIGHT);
      setItemsPerPage(Math.max(5, calculated)); // Minimum 5 items
    };

    updateItemsPerPage();
    window.addEventListener("resize", updateItemsPerPage);
    return () => window.removeEventListener("resize", updateItemsPerPage);
  }, []);

  // Fetch projects for multi-select filter
  useEffect(() => {
    if (!user?.token) return;

    const fetchProjects = async () => {
      try {
        const response = await fetch(`${apiUrl}/projects`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!response.ok) return;
        const data: Project[] = await response.json();
        setAvailableProjects(data);

        // Extract unique clients
        const clientsMap = new Map<string, { id: string; name: string }>();
        data.forEach((project) => {
          if (project.tenantClient) {
            const client = project.tenantClient;
            const name = client.displayName || `${client.firstName} ${client.lastName}`.trim();
            if (!clientsMap.has(client.id)) {
              clientsMap.set(client.id, { id: client.id, name });
            }
          }
        });
        setAvailableClients(Array.from(clientsMap.values()));
      } catch (err) {
        console.error("Failed to fetch projects:", err);
      }
    };

    fetchProjects();
  }, [user?.token, apiUrl]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch more logs to support pagination (fetch all, paginate client-side)
      const response = await fetch(`${apiUrl}/daily-logs?limit=500`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch daily logs: ${response.statusText}`);
      }

      const data: DailyLogsResponse = await response.json();
      setLogs(data.items);
      setTotal(data.total);

      // Extract unique users for filter
      const uniqueUsers = Array.from(
        new Map(data.items.map((log) => [log.createdByUser.id, log.createdByUser])).values(),
      );
      setAvailableUsers(uniqueUsers);
    } catch (err: any) {
      console.error("Failed to fetch daily logs:", err);
      setError(err.message || "Failed to load daily logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchLogs();
    }
  }, [user?.token, apiUrl]);

  // Apply all filters
  const filteredLogs = logs.filter((log) => {
    // User filter
    if (selectedUserId && log.createdByUser.id !== selectedUserId) return false;
    
    // Type filter
    if (selectedType && log.type !== selectedType) return false;
    
    // Status filter
    if (selectedStatus && log.status !== selectedStatus) return false;
    
    // Project filter
    if (selectedProjectIds.length > 0 && !selectedProjectIds.includes(log.projectId)) {
      return false;
    }
    
    // Client filter (check if project belongs to selected client)
    if (selectedClientIds.length > 0) {
      const project = availableProjects.find((p) => p.id === log.projectId);
      if (!project?.tenantClient || !selectedClientIds.includes(project.tenantClient.id)) {
        return false;
      }
    }
    
    // Date range filter
    if (dateFrom) {
      const logDate = new Date(log.logDate).toISOString().split("T")[0];
      if (logDate < dateFrom) return false;
    }
    if (dateTo) {
      const logDate = new Date(log.logDate).toISOString().split("T")[0];
      if (logDate > dateTo) return false;
    }
    
    // Text search (searches in title, work performed, issues, project name)
    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      const searchableText = [
        log.title || "",
        log.workPerformed || "",
        log.issues || "",
        log.projectName || "",
        log.crewOnSite || "",
      ].join(" ").toLowerCase();
      
      if (!searchableText.includes(query)) return false;
    }
    
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUserId, selectedType, selectedStatus, selectedProjectIds, selectedClientIds, dateFrom, dateTo, searchText]);

  const handleLogClick = (log: DailyLog) => {
    startUiTransition(() => {
      router.push(`/projects/${log.projectId}`);
    });
  };

  const getUserDisplayName = (user: CreatedByUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.lastName) return user.lastName;
    return user.email;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const clearFilters = () => {
    setSelectedUserId("");
    setSelectedType("");
    setSelectedStatus("");
    setSearchText("");
    setSelectedProjectIds([]);
    setSelectedClientIds([]);
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  };

  const hasActiveFilters = () => {
    return (
      selectedUserId ||
      selectedType ||
      selectedStatus ||
      searchText.trim() ||
      selectedProjectIds.length > 0 ||
      selectedClientIds.length > 0 ||
      dateFrom ||
      dateTo
    );
  };

  if (!user) {
    return (
      <div className="app-card" style={{ textAlign: "center", padding: "40px" }}>
        <p>Please log in to view daily logs.</p>
      </div>
    );
  }

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
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>
          Daily Logs - All Projects
        </h2>

        {/* Search Box */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search logs (title, work, issues, crew, project name)..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
        </div>

        {/* Filter Row 1: Basic Filters */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {/* User Filter */}
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Users</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {getUserDisplayName(u)}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Types</option>
            {Object.entries(LOG_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Filter Row 2: Multi-Select Projects and Clients */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          {/* Projects Multi-Select */}
          <details style={{ flex: 1 }}>
            <summary
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              Projects {selectedProjectIds.length > 0 && `(${selectedProjectIds.length})`}
            </summary>
            <div
              style={{
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "white",
                padding: 8,
              }}
            >
              {availableProjects.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: 8 }}>No projects available</div>
              ) : (
                availableProjects.map((project) => (
                  <label
                    key={project.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProjectSelection(project.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {project.name}
                  </label>
                ))
              )}
            </div>
          </details>

          {/* Clients Multi-Select */}
          <details style={{ flex: 1 }}>
            <summary
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              Clients {selectedClientIds.length > 0 && `(${selectedClientIds.length})`}
            </summary>
            <div
              style={{
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "white",
                padding: 8,
              }}
            >
              {availableClients.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: 8 }}>No clients available</div>
              ) : (
                availableClients.map((client) => (
                  <label
                    key={client.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleClientSelection(client.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {client.name}
                  </label>
                ))
              )}
            </div>
          </details>
        </div>

        {/* Action Row: Clear Filters and Result Count */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          {hasActiveFilters() && (
            <button
              onClick={clearFilters}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              Clear All Filters
            </button>
          )}
          <span style={{ fontSize: 14, color: "#6b7280", marginLeft: "auto" }}>
            Showing {paginatedLogs.length} of {filteredLogs.length} logs
            {filteredLogs.length !== total && ` (filtered from ${total} total)`}
          </span>
        </div>
      </div>

      {/* Daily Logs Feed */}
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Loading daily logs...
          </div>
        )}

        {error && (
          <div
            className="app-card"
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              padding: 16,
              borderRadius: 8,
            }}
          >
            <p style={{ color: "#991b1b", margin: 0 }}>Error: {error}</p>
          </div>
        )}

        {!loading && !error && filteredLogs.length === 0 && (
          <div
            className="app-card"
            style={{ textAlign: "center", padding: 40, color: "#6b7280" }}
          >
            <p style={{ margin: 0 }}>
              {logs.length === 0
                ? "No daily logs found. Daily logs will appear here when created."
                : "No logs match the selected filters."}
            </p>
          </div>
        )}

        {!loading && !error && filteredLogs.length > 0 && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {paginatedLogs.map((log) => (
              <div
                key={log.id}
                className="app-card"
                onClick={() => handleLogClick(log)}
                style={{
                  padding: 16,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  border: "1px solid #e5e7eb",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Header Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {/* Project Name */}
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "#1f2937",
                    }}
                  >
                    {log.projectName}
                  </div>

                  {/* Log Type Badge */}
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      backgroundColor: "#f3f4f6",
                      color: "#4b5563",
                    }}
                  >
                    {LOG_TYPE_LABELS[log.type]}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={STATUS_COLORS[log.status]}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {log.status}
                  </span>

                  {/* Date */}
                  <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
                    {formatDate(log.logDate)}
                  </span>
                </div>

                {/* Title */}
                {log.title && (
                  <div
                    style={{
                      fontSize: 14,
                      color: "#374151",
                      fontWeight: 500,
                      marginBottom: 8,
                    }}
                  >
                    {log.title}
                  </div>
                )}

                {/* Content Preview */}
                {(log.workPerformed || log.issues || log.crewOnSite) && (
                  <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
                    {log.workPerformed && (
                      <div style={{ marginBottom: 4 }}>
                        <strong>Work:</strong>{" "}
                        {log.workPerformed.length > 150
                          ? `${log.workPerformed.substring(0, 150)}...`
                          : log.workPerformed}
                      </div>
                    )}
                    {log.issues && (
                      <div style={{ marginBottom: 4 }}>
                        <strong>Issues:</strong>{" "}
                        {log.issues.length > 100
                          ? `${log.issues.substring(0, 100)}...`
                          : log.issues}
                      </div>
                    )}
                    {log.crewOnSite && (
                      <div>
                        <strong>Crew:</strong> {log.crewOnSite}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 13,
                    color: "#6b7280",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  <span>
                    <strong>By:</strong> {getUserDisplayName(log.createdByUser)}
                  </span>
                  <span>•</span>
                  <span>{formatTime(log.createdAt)}</span>
                  {log.attachments.length > 0 && (
                    <>
                      <span>•</span>
                      <span>📎 {log.attachments.length} attachment(s)</span>
                    </>
                  )}
                </div>
              </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    backgroundColor: currentPage === 1 ? "#f3f4f6" : "white",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: 14,
                  }}
                >
                  Previous
                </button>

                <div style={{ display: "flex", gap: 4 }}>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    // Show first 3, last 1, and current page context
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          backgroundColor: currentPage === pageNum ? "#3b82f6" : "white",
                          color: currentPage === pageNum ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: currentPage === pageNum ? 600 : 400,
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    backgroundColor: currentPage === totalPages ? "#f3f4f6" : "white",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: 14,
                  }}
                >
                  Next
                </button>

                <span style={{ fontSize: 14, color: "#6b7280", marginLeft: 8 }}>
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
