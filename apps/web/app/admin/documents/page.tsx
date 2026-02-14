"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// --- Types ---

interface ScanJob {
  id: string;
  scanPath: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  documentsFound: number;
  documentsProcessed: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  createdBy?: { firstName?: string; lastName?: string; email: string };
}

interface StagedSOP {
  id: string;
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: "draft" | "published";
  created: string;
  updated: string;
  fileName: string;
}

// Document type classification
type DocumentTypeGuess = 
  | "LIKELY_PROCEDURE" 
  | "LIKELY_POLICY" 
  | "LIKELY_FORM" 
  | "REFERENCE_DOC" 
  | "UNLIKELY_PROCEDURE" 
  | "UNKNOWN";

interface StagedDocument {
  id: string;
  fileName: string;
  filePath: string;
  breadcrumb: string[];
  fileType: string;
  fileSize: string;
  mimeType?: string;
  status: "ACTIVE" | "ARCHIVED" | "PUBLISHED";
  scannedAt: string;
  archivedAt?: string;
  publishedAt?: string;
  scanJob?: { id: string; scanPath: string };
  // Tagging & categorization
  tags?: string[];
  category?: string;
  subcategory?: string;
  displayTitle?: string;
  displayDescription?: string;
  // Revision control
  revisionNumber?: number;
  revisionDate?: string;
  revisionNotes?: string;
  // Document classification
  documentTypeGuess?: DocumentTypeGuess;
  classificationScore?: number;
  classificationReason?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface DocumentStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Array<{ fileType: string; count: number }>;
}

type StatusFilter = "ACTIVE" | "ARCHIVED" | "ALL";

// --- Main Page Component ---

export default function DocumentImportPage() {
  const [documents, setDocuments] = useState<StagedDocument[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScanJob, setSelectedScanJob] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modals
  const [showScanModal, setShowScanModal] = useState(false);
  const [quickLookDoc, setQuickLookDoc] = useState<StagedDocument | null>(null);
  const [importDoc, setImportDoc] = useState<StagedDocument | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Unpublished SOPs
  const [sops, setSops] = useState<StagedSOP[]>([]);
  const [sopsExpanded, setSopsExpanded] = useState(false);
  const [sopsLoading, setSopsLoading] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  // Load data
  const loadDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (selectedScanJob) params.set("scanJobId", selectedScanJob);
      if (selectedFileType) params.set("fileType", selectedFileType);
      params.set("page", page.toString());
      params.set("pageSize", "50");

      const res = await fetch(`${API_BASE}/document-import/documents?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error(`Failed to load documents: ${res.status}`);

      const data: PaginatedResponse<StagedDocument> = await res.json();
      setDocuments(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load documents");
    }
  }, [statusFilter, searchQuery, selectedScanJob, selectedFileType, page]);

  const loadStats = useCallback(async () => {
    try {
      const params = selectedScanJob ? `?scanJobId=${selectedScanJob}` : "";
      const res = await fetch(`${API_BASE}/document-import/stats${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Stats are nice-to-have, don't block on failure
    }
  }, [selectedScanJob]);

  const loadScanJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/document-import/scan-jobs?pageSize=100`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: PaginatedResponse<ScanJob> = await res.json();
        setScanJobs(data.items);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const loadSOPs = useCallback(async () => {
    setSopsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/document-import/sops?status=draft`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSops(data.items || []);
      }
    } catch {
      // SOPs endpoint might not exist yet - that's OK
      setSops([]);
    } finally {
      setSopsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }

    Promise.all([loadDocuments(), loadStats(), loadScanJobs(), loadSOPs()]).finally(() =>
      setLoading(false)
    );
  }, [loadDocuments, loadStats, loadScanJobs, loadSOPs]);

  // Reload when filters change
  useEffect(() => {
    if (!loading) {
      loadDocuments();
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchQuery, selectedScanJob, selectedFileType, page]);

  // Poll for running scan jobs
  useEffect(() => {
    const runningJob = scanJobs.find((j) => j.status === "RUNNING" || j.status === "PENDING");
    if (!runningJob) return;

    const interval = setInterval(() => {
      loadScanJobs();
      loadDocuments();
      loadStats();
    }, 2000);

    return () => clearInterval(interval);
  }, [scanJobs, loadScanJobs, loadDocuments, loadStats]);

  // Actions
  const handleUpdateStatus = async (docId: string, status: "ACTIVE" | "ARCHIVED") => {
    try {
      const res = await fetch(`${API_BASE}/document-import/documents/${docId}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update document");
      loadDocuments();
      loadStats();
    } catch (err: any) {
      alert(err?.message ?? "Failed to update document");
    }
  };

  const handleBulkUpdate = async (status: "ACTIVE" | "ARCHIVED") => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API_BASE}/document-import/documents/bulk-update`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: Array.from(selectedIds), status }),
      });
      if (!res.ok) throw new Error("Failed to update documents");
      setSelectedIds(new Set());
      loadDocuments();
      loadStats();
    } catch (err: any) {
      alert(err?.message ?? "Failed to update documents");
    }
  };

  const handleStartScan = async (scanPath: string) => {
    try {
      const res = await fetch(`${API_BASE}/document-import/scan-jobs`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ scanPath }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to start scan: ${res.status}`);
      }
      setShowScanModal(false);
      loadScanJobs();
    } catch (err: any) {
      alert(err?.message ?? "Failed to start scan");
    }
  };

  const handleImport = async (
    docId: string,
    importData: {
      importToType: string;
      importToCategory: string;
      displayTitle?: string;
      displayDescription?: string;
      oshaReference?: string;
    }
  ) => {
    try {
      const res = await fetch(`${API_BASE}/document-import/documents/${docId}/import`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(importData),
      });
      if (!res.ok) throw new Error("Failed to import document");
      setImportDoc(null);
      loadDocuments();
      loadStats();
    } catch (err: any) {
      alert(err?.message ?? "Failed to import document");
    }
  };

  const handleBulkImport = async (importData: { importToType: string; importToCategory: string }) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API_BASE}/document-import/documents/bulk-import`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: Array.from(selectedIds),
          ...importData,
        }),
      });
      if (!res.ok) throw new Error("Failed to import documents");
      setSelectedIds(new Set());
      setShowBulkImportModal(false);
      loadDocuments();
      loadStats();
    } catch (err: any) {
      alert(err?.message ?? "Failed to import documents");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Current running job
  const runningJob = scanJobs.find((j) => j.status === "RUNNING" || j.status === "PENDING");

  if (loading) {
    return (
      <PageCard>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading eDocs...</p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Unpublished eDocs</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>Unpublished eDocs</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Browse and upload documents, tag them for organization, and publish to your team.
          </p>
        </header>

        {/* Running Job Banner */}
        {runningJob && (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#eff6ff",
              border: "1px solid #93c5fd",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                border: "3px solid #3b82f6",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#1e40af" }}>
                Scanning: {runningJob.scanPath}
              </div>
              <div style={{ fontSize: 12, color: "#3b82f6" }}>
                {runningJob.documentsProcessed.toLocaleString()} documents processed
                {runningJob.documentsFound > 0 && ` of ${runningJob.documentsFound.toLocaleString()} found`}
              </div>
            </div>
          </div>
        )}

        {/* Unpublished SOPs - Collapsible Section */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "#fefce8",
          }}
        >
          <button
            type="button"
            onClick={() => setSopsExpanded(!sopsExpanded)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#854d0e" }}>
                Unpublished SOPs
              </span>
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 10,
                  backgroundColor: "#fde047",
                  color: "#713f12",
                  fontWeight: 500,
                }}
              >
                {sops.length}
              </span>
            </div>
            <span style={{ fontSize: 14, color: "#854d0e" }}>
              {sopsExpanded ? "▼" : "▶"}
            </span>
          </button>

          {sopsExpanded && (
            <div style={{ padding: "0 16px 16px", borderTop: "1px solid #fde047" }}>
              {sopsLoading ? (
                <p style={{ fontSize: 13, color: "#854d0e", padding: "12px 0" }}>Loading SOPs...</p>
              ) : sops.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "#a16207", marginBottom: 8 }}>
                    No unpublished SOPs found.
                  </p>
                  <p style={{ fontSize: 12, color: "#ca8a04" }}>
                    SOPs are generated when features are pushed to production.<br />
                    Check <code style={{ backgroundColor: "#fef9c3", padding: "2px 4px", borderRadius: 3 }}>docs/sops-staging/</code> for pending SOPs.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {sops.map((sop) => (
                    <div
                      key={sop.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #fde68a",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>
                            {sop.title}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              backgroundColor: "#dbeafe",
                              color: "#1e40af",
                              fontWeight: 500,
                            }}
                          >
                            Rev {sop.revision}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          Module: {sop.module} • Updated: {new Date(sop.updated).toLocaleDateString()}
                        </div>
                        {sop.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            {sop.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  backgroundColor: "#f3f4f6",
                                  color: "#4b5563",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          title="Preview SOP"
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            backgroundColor: "#f3f4f6",
                            color: "#374151",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          title="Publish SOP"
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            backgroundColor: "#16a34a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          🚀 Publish
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Bar */}
        {stats && (
          <div
            style={{
              display: "flex",
              gap: 16,
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              flexWrap: "wrap",
            }}
          >
            <StatBox label="Total" value={stats.total} />
            <StatBox label="Unpublished" value={stats.byStatus.ACTIVE ?? 0} color="#f59e0b" />
            <StatBox label="Archived" value={stats.byStatus.ARCHIVED ?? 0} color="#6b7280" />
            <StatBox label="Published" value={stats.byStatus.PUBLISHED ?? 0} color="#16a34a" />
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {/* Browse/Upload Button */}
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📁 Browse & Upload
          </button>

          {/* Create Document Button */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ✏️ Create Document
          </button>

          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 6,
              }}
            />
          </div>

          {/* Three-way Status Filter */}
          <div
            style={{
              display: "flex",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {(["ACTIVE", "ARCHIVED", "ALL"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  border: "none",
                  borderRight: status !== "ALL" ? "1px solid #d1d5db" : "none",
                  backgroundColor: statusFilter === status ? "#2563eb" : "#ffffff",
                  color: statusFilter === status ? "#ffffff" : "#374151",
                  cursor: "pointer",
                  fontWeight: statusFilter === status ? 600 : 400,
                }}
              >
                {status === "ALL" ? "View All" : status === "ACTIVE" ? "Unpublished" : "Archived"}
              </button>
            ))}
          </div>

          {/* File Type Filter */}
          {stats && stats.byType.length > 0 && (
            <select
              value={selectedFileType ?? ""}
              onChange={(e) => {
                setSelectedFileType(e.target.value || null);
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "#ffffff",
              }}
            >
              <option value="">All types</option>
              {stats.byType.map((t) => (
                <option key={t.fileType} value={t.fileType}>
                  .{t.fileType} ({t.count})
                </option>
              ))}
            </select>
          )}

          {/* Scan Job Filter */}
          {scanJobs.length > 0 && (
            <select
              value={selectedScanJob ?? ""}
              onChange={(e) => {
                setSelectedScanJob(e.target.value || null);
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "#ffffff",
                maxWidth: 200,
              }}
            >
              <option value="">All scans</option>
              {scanJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.scanPath.split("/").pop()} ({j.documentsFound})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 16px",
              backgroundColor: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "#92400e" }}>
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => handleBulkUpdate("ARCHIVED")}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                backgroundColor: "#6b7280",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Archive Selected
            </button>
            <button
              type="button"
              onClick={() => handleBulkUpdate("ACTIVE")}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Restore Selected
            </button>
            <button
              type="button"
              onClick={() => setShowBulkImportModal(true)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              🚀 Publish Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                backgroundColor: "transparent",
                color: "#92400e",
                border: "1px solid #fcd34d",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Document List */}
        {documents.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#6b7280",
              backgroundColor: "#f9fafb",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>No documents found</div>
            <div style={{ fontSize: 14 }}>
          {total === 0
                ? "Click 'Browse & Upload' to add documents from your computer"
                : "Try adjusting your filters"}
            </div>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.size === documents.length && documents.length > 0}
                onChange={toggleSelectAll}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Select all ({documents.length} on this page)
              </span>
            </div>

            {/* Document Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  selected={selectedIds.has(doc.id)}
                  onSelect={() => toggleSelect(doc.id)}
                  onQuickLook={() => setQuickLookDoc(doc)}
                  onToggleStatus={() =>
                    handleUpdateStatus(doc.id, doc.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")
                  }
                  onImport={() => setImportDoc(doc)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 4,
                    backgroundColor: page === 1 ? "#f3f4f6" : "#ffffff",
                    color: page === 1 ? "#9ca3af" : "#374151",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Page {page} of {totalPages} ({total.toLocaleString()} total)
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 4,
                    backgroundColor: page === totalPages ? "#f3f4f6" : "#ffffff",
                    color: page === totalPages ? "#9ca3af" : "#374151",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Browse Folder Modal */}
      {showScanModal && (
        <BrowseFolderModal
          onClose={() => setShowScanModal(false)}
          onFilesUploaded={() => {
            loadDocuments();
            loadStats();
            loadScanJobs();
          }}
        />
      )}

      {/* QuickLook Modal */}
      {quickLookDoc && (
        <QuickLookModal document={quickLookDoc} onClose={() => setQuickLookDoc(null)} />
      )}

      {/* Import Modal (single document) */}
      {importDoc && (
        <ImportModal
          document={importDoc}
          onClose={() => setImportDoc(null)}
          onImport={(data) => handleImport(importDoc.id, data)}
        />
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <BulkImportModal
          count={selectedIds.size}
          onClose={() => setShowBulkImportModal(false)}
          onImport={handleBulkImport}
        />
      )}

      {/* Create Document Modal */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={() => {
            loadDocuments();
            loadStats();
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Spin animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </PageCard>
  );
}

// --- Helper Components ---

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 80 }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: color ?? "#111827" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

// --- Document Card Component ---

interface DocumentCardProps {
  document: StagedDocument;
  selected: boolean;
  onSelect: () => void;
  onQuickLook: () => void;
  onToggleStatus: () => void;
  onImport: () => void;
}

// Classification badge config
const CLASSIFICATION_CONFIG: Record<DocumentTypeGuess, { emoji: string; label: string; bgColor: string; textColor: string }> = {
  LIKELY_PROCEDURE: { emoji: "✅", label: "Procedure", bgColor: "#dcfce7", textColor: "#166534" },
  LIKELY_POLICY: { emoji: "📋", label: "Policy", bgColor: "#dbeafe", textColor: "#1e40af" },
  LIKELY_FORM: { emoji: "📝", label: "Form", bgColor: "#fef3c7", textColor: "#92400e" },
  REFERENCE_DOC: { emoji: "📖", label: "Reference", bgColor: "#f3f4f6", textColor: "#374151" },
  UNLIKELY_PROCEDURE: { emoji: "⚠️", label: "Unlikely Proc", bgColor: "#fee2e2", textColor: "#991b1b" },
  UNKNOWN: { emoji: "❓", label: "Unknown", bgColor: "#f3f4f6", textColor: "#6b7280" },
};

function DocumentCard({ document, selected, onSelect, onQuickLook, onToggleStatus, onImport }: DocumentCardProps) {
  const isArchived = document.status === "ARCHIVED";
  const isPublished = document.status === "PUBLISHED";

  const formatFileSize = (bytes: string) => {
    const num = parseInt(bytes, 10);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    const icons: Record<string, string> = {
      pdf: "📕",
      doc: "📘",
      docx: "📘",
      xls: "📗",
      xlsx: "📗",
      ppt: "📙",
      pptx: "📙",
      txt: "📄",
      md: "📝",
      csv: "📊",
      jpg: "🖼️",
      jpeg: "🖼️",
      png: "🖼️",
      gif: "🖼️",
    };
    return icons[type.toLowerCase()] ?? "📁";
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 12,
        backgroundColor: selected ? "#eff6ff" : isArchived ? "#f9fafb" : "#ffffff",
        border: `1px solid ${selected ? "#93c5fd" : "#e5e7eb"}`,
        borderRadius: 8,
        opacity: isArchived ? 0.7 : 1,
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        style={{ width: 16, height: 16, flexShrink: 0 }}
      />

      {/* File Icon */}
      <span style={{ fontSize: 24, flexShrink: 0 }}>{getFileIcon(document.fileType)}</span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: isArchived ? "#6b7280" : "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {document.fileName}
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              backgroundColor: isPublished
                ? "#dcfce7"
                : isArchived
                ? "#f3f4f6"
                : "#fef3c7",
              color: isPublished ? "#166534" : isArchived ? "#6b7280" : "#92400e",
              fontWeight: 500,
            }}
          >
            {isPublished ? "Published" : isArchived ? "Archived" : "Unpublished"}
          </span>
          {/* Classification Badge */}
          {document.documentTypeGuess && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: CLASSIFICATION_CONFIG[document.documentTypeGuess]?.bgColor || "#f3f4f6",
                color: CLASSIFICATION_CONFIG[document.documentTypeGuess]?.textColor || "#6b7280",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
              title={document.classificationReason || "Document type classification"}
            >
              {CLASSIFICATION_CONFIG[document.documentTypeGuess]?.emoji}
              {CLASSIFICATION_CONFIG[document.documentTypeGuess]?.label}
              {document.classificationScore && (
                <span style={{ opacity: 0.7 }}>
                  ({Math.round((document.classificationScore || 0) * 100)}%)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Breadcrumb */}
        <div
          style={{
            fontSize: 12,
            color: "#9ca3af",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={document.breadcrumb.join(" / ")}
        >
          📁 {document.breadcrumb.slice(0, -1).join(" / ")}
        </div>

        {/* Metadata */}
        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "#6b7280" }}>
          <span>.{document.fileType.toUpperCase()}</span>
          <span>{formatFileSize(document.fileSize)}</span>
          <span>Scanned {new Date(document.scannedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onQuickLook}
          title="Quick Look"
          style={{
            padding: "6px 10px",
            fontSize: 12,
            backgroundColor: "#f3f4f6",
            color: "#374151",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          👁️
        </button>
        {!isPublished && !isArchived && (
          <button
            type="button"
            onClick={onImport}
            title="Publish Document"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              backgroundColor: "#dcfce7",
              color: "#166534",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            🚀
          </button>
        )}
        {!isPublished && (
          <button
            type="button"
            onClick={onToggleStatus}
            title={isArchived ? "Restore" : "Archive"}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              backgroundColor: isArchived ? "#dcfce7" : "#fee2e2",
              color: isArchived ? "#166534" : "#991b1b",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {isArchived ? "↩️" : "🗑️"}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Browse Folder Modal with File System Access API ---

const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "txt", "csv",
  "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg",
  "md", "markdown", "json", "xml", "yaml", "yml", "html", "htm",
]);

interface ScannedFile {
  name: string;
  path: string[];
  size: number;
  type: string;
  file: File;
}

interface FolderNode {
  name: string;
  files: ScannedFile[];
  children: Map<string, FolderNode>;
}

interface BrowseFolderModalProps {
  onClose: () => void;
  onFilesUploaded: () => void;
}

function BrowseFolderModal({ onClose, onFilesUploaded }: BrowseFolderModalProps) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Scan progress state
  const [scanProgress, setScanProgress] = useState({ filesFound: 0, currentPath: "" });
  // Selection state - track selected files by their path key (e.g., "Root/Safety/file.pdf")
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const isSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;
  
  // Get file path key for selection tracking
  const getFileKey = (file: ScannedFile) => file.path.join("/");
  
  // Get all file keys under a folder path
  const getFilesUnderPath = (pathPrefix: string): string[] => {
    return scannedFiles
      .filter(f => getFileKey(f).startsWith(pathPrefix + "/") || getFileKey(f) === pathPrefix)
      .map(getFileKey);
  };
  
  // Check folder selection state: 'all' | 'some' | 'none'
  const getFolderSelectionState = (pathKey: string): 'all' | 'some' | 'none' => {
    const filesUnder = getFilesUnderPath(pathKey);
    if (filesUnder.length === 0) return 'none';
    const selectedCount = filesUnder.filter(f => selectedFiles.has(f)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === filesUnder.length) return 'all';
    return 'some';
  };
  
  // Toggle folder selection - selects/deselects all children
  const toggleFolderSelection = (pathKey: string) => {
    const state = getFolderSelectionState(pathKey);
    const filesUnder = getFilesUnderPath(pathKey);
    
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (state === 'all') {
        // Deselect all
        filesUnder.forEach(f => next.delete(f));
      } else {
        // Select all
        filesUnder.forEach(f => next.add(f));
      }
      return next;
    });
  };
  
  // Toggle individual file selection
  const toggleFileSelection = (fileKey: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  };
  
  // Select all / deselect all
  const selectAll = () => {
    setSelectedFiles(new Set(scannedFiles.map(getFileKey)));
  };
  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Build folder tree from flat file list
  const folderTree = useMemo(() => {
    const root: FolderNode = { name: folderName || "Root", files: [], children: new Map() };
    
    for (const file of scannedFiles) {
      let current = root;
      // Skip root folder name, process intermediate folders
      const folders = file.path.slice(1, -1);
      
      for (const folder of folders) {
        if (!current.children.has(folder)) {
          current.children.set(folder, { name: folder, files: [], children: new Map() });
        }
        current = current.children.get(folder)!;
      }
      current.files.push(file);
    }
    
    return root;
  }, [scannedFiles, folderName]);

  const handleBrowse = async () => {
    if (!isSupported) {
      setError("Your browser doesn't support folder selection. Please use Chrome or Edge.");
      return;
    }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: "read" });
      setFolderHandle(handle);
      setFolderName(handle.name);
      setScannedFiles([]);
      setScanComplete(false);
      setConfirmed(false);
      setError(null);
      setExpandedFolders(new Set());
      setSelectedFiles(new Set());
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError("Failed to select folder.");
      }
    }
  };

  const scanFolder = async () => {
    if (!folderHandle || !confirmed) return;
    setIsScanning(true);
    setError(null);
    setScanProgress({ filesFound: 0, currentPath: folderHandle.name });
    const files: ScannedFile[] = [];

    async function scanDir(dirHandle: FileSystemDirectoryHandle, path: string[]) {
      // Update current path being scanned
      setScanProgress(prev => ({ ...prev, currentPath: path.join(" / ") }));
      
      try {
        // @ts-ignore
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file") {
            const ext = entry.name.split(".").pop()?.toLowerCase() || "";
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              try {
                // @ts-ignore
                const file = await entry.getFile();
                files.push({ name: entry.name, path: [...path, entry.name], size: file.size, type: ext, file });
                // Update file count in real-time
                setScanProgress(prev => ({ ...prev, filesFound: files.length }));
              } catch {}
            }
          } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
            // @ts-ignore
            await scanDir(entry, [...path, entry.name]);
          }
        }
      } catch {}
    }

    await scanDir(folderHandle, [folderHandle.name]);
    console.log("[Scan Complete]", files.length, "files found:", files.map(f => f.name));
    setScannedFiles(files);
    setIsScanning(false);
    setScanComplete(true);
    // Auto-expand root and select all files by default
    setExpandedFolders(new Set([folderHandle.name]));
    setSelectedFiles(new Set(files.map(f => f.path.join("/"))));
  };

  const handleUpload = async () => {
    // Only index selected files
    const filesToIndex = scannedFiles.filter(f => selectedFiles.has(getFileKey(f)));
    if (filesToIndex.length === 0) {
      setError("Please select at least one file to index.");
      return;
    }
    setIsUploading(true);
    setUploadProgress({ current: 0, total: filesToIndex.length });
    setError(null);
    const token = localStorage.getItem("accessToken");

    let scanJobId: string | null = null;
    let successCount = 0;
    const failedFiles: string[] = [];

    for (let i = 0; i < filesToIndex.length; i++) {
      const sf = filesToIndex[i];
      try {
        const formData = new FormData();
        formData.append("file", sf.file);
        formData.append("fileName", sf.name);
        formData.append("breadcrumb", JSON.stringify(sf.path));
        formData.append("fileType", sf.type);
        formData.append("folderName", folderName || "Index");
        // Reuse scanJobId so all files are grouped together
        if (scanJobId) {
          formData.append("scanJobId", scanJobId);
        }

        const res = await fetch(`${API_BASE}/document-import/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          // Log but continue with other files
          console.warn(`Failed to index ${sf.name}:`, await res.text());
          failedFiles.push(sf.name);
        } else {
          const result = await res.json();
          // Capture scanJobId from first successful response
          if (!scanJobId && result.scanJobId) {
            scanJobId = result.scanJobId;
          }
          successCount++;
        }
      } catch (err) {
        console.warn(`Error indexing ${sf.name}:`, err);
        failedFiles.push(sf.name);
      }

      setUploadProgress({ current: i + 1, total: filesToIndex.length });
    }

    // Show results
    if (failedFiles.length > 0 && successCount === 0) {
      // All failed
      setError(`Failed to index all ${failedFiles.length} files. Check console for details.`);
      setIsUploading(false);
    } else if (failedFiles.length > 0) {
      // Some failed - show warning but close modal
      console.warn(`Failed files (${failedFiles.length}):`, failedFiles);
      alert(`Indexed ${successCount} documents successfully.\n\n${failedFiles.length} file(s) could not be indexed (unsupported format or extraction error).`);
      onFilesUploaded();
      onClose();
    } else {
      // All succeeded
      onFilesUploaded();
      onClose();
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Recursive folder tree renderer
  const renderFolderTree = (node: FolderNode, depth: number = 0, pathKey: string = node.name) => {
    const isExpanded = expandedFolders.has(pathKey);
    const hasChildren = node.children.size > 0 || node.files.length > 0;
    const totalFiles = countFiles(node);
    const selectionState = getFolderSelectionState(pathKey);
    const selectedCount = getFilesUnderPath(pathKey).filter(f => selectedFiles.has(f)).length;

    return (
      <div key={pathKey} style={{ marginLeft: depth * 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 4,
            backgroundColor: depth === 0 ? "#f0f9ff" : "transparent",
          }}
        >
          {/* Folder checkbox - tri-state */}
          <input
            type="checkbox"
            checked={selectionState === 'all'}
            ref={(el) => { if (el) el.indeterminate = selectionState === 'some'; }}
            onChange={() => toggleFolderSelection(pathKey)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
          />
          {/* Expand/collapse toggle */}
          <span
            onClick={() => hasChildren && toggleFolder(pathKey)}
            style={{ fontSize: 12, color: "#6b7280", width: 16, cursor: hasChildren ? "pointer" : "default" }}
          >
            {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
          </span>
          <span
            onClick={() => hasChildren && toggleFolder(pathKey)}
            style={{ fontSize: 14, cursor: hasChildren ? "pointer" : "default" }}
          >📁</span>
          <span
            onClick={() => hasChildren && toggleFolder(pathKey)}
            style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: "#374151", cursor: hasChildren ? "pointer" : "default", flex: 1 }}
          >
            {node.name}
          </span>
          <span style={{ fontSize: 11, color: selectionState === 'all' ? "#16a34a" : selectionState === 'some' ? "#d97706" : "#9ca3af" }}>
            {selectedCount}/{totalFiles} selected
          </span>
        </div>
        
        {isExpanded && (
          <div>
            {/* Child folders */}
            {[...node.children.values()].map(child => 
              renderFolderTree(child, depth + 1, `${pathKey}/${child.name}`)
            )}
            {/* Files in this folder */}
            {node.files.map((f, i) => {
              const fileKey = getFileKey(f);
              const isSelected = selectedFiles.has(fileKey);
              return (
                <div
                  key={`${pathKey}/${f.name}-${i}`}
                  onClick={() => toggleFileSelection(fileKey)}
                  style={{
                    marginLeft: (depth + 1) * 16,
                    padding: "3px 8px",
                    fontSize: 12,
                    color: isSelected ? "#374151" : "#9ca3af",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    backgroundColor: isSelected ? "#f0fdf4" : "transparent",
                    borderRadius: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFileSelection(fileKey)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#16a34a" }}
                  />
                  <span>{getFileIcon(f.type)}</span>
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>{formatSize(f.size)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  function countFiles(node: FolderNode): number {
    let count = node.files.length;
    for (const child of node.children.values()) {
      count += countFiles(child);
    }
    return count;
  }

  function getFileIcon(type: string) {
    const icons: Record<string, string> = {
      pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗",
      ppt: "📙", pptx: "📙", txt: "📄", md: "📝", csv: "📊",
      jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️",
    };
    return icons[type] ?? "📄";
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "10vh 24px", // 10% top/bottom margin
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 900,
          height: "100%", // Fill the 80% space (100% of parent which has 10vh padding top/bottom)
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18, flexShrink: 0 }}>Browse for Documents</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280", flexShrink: 0 }}>
          Select a folder on your computer to scan for documents.
        </p>

        {error && (
          <div style={{ padding: 12, backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, marginBottom: 16, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p>
          </div>
        )}

        {/* Browse Button */}
        <div style={{ marginBottom: 16, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleBrowse}
            disabled={isScanning || isUploading}
            style={{ padding: "12px 20px", fontSize: 14, fontWeight: 500, backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: isScanning || isUploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            📁 Browse...
          </button>
          {folderName && (
            <p style={{ marginTop: 8, fontSize: 14, color: "#16a34a", fontWeight: 500 }}>✓ Selected: {folderName}</p>
          )}
        </div>

        {/* Confirmation Checkbox */}
        {folderName && !scanComplete && (
          <div style={{ marginBottom: 16, flexShrink: 0 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 13, color: "#0c4a6e", lineHeight: 1.5 }}>
                Search your storage device or folder for documents to import. After you make the selections on which documents to import to your organization, the import will begin.
              </span>
            </label>
            <button
              type="button"
              onClick={scanFolder}
              disabled={!confirmed || isScanning}
              style={{ marginTop: 12, padding: "10px 20px", fontSize: 14, fontWeight: 500, backgroundColor: !confirmed || isScanning ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: !confirmed || isScanning ? "not-allowed" : "pointer" }}
            >
              {isScanning ? "🔄 Scanning..." : "🔍 Scan Folder"}
            </button>
          </div>
        )}

        {/* Real-time Scan Progress */}
        {isScanning && (
          <div style={{ marginBottom: 16, padding: 16, backgroundColor: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 20, height: 20, border: "3px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1e40af" }}>
                {scanProgress.filesFound} document{scanProgress.filesFound !== 1 ? "s" : ""} found
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#3b82f6", display: "flex", alignItems: "center", gap: 6 }}>
              <span>📂</span>
              <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scanProgress.currentPath || "Starting scan..."}
              </span>
            </div>
          </div>
        )}

        {/* Folder Tree Results - Scrollable area */}
        {scanComplete && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginBottom: 16 }}>
            <div style={{ padding: 12, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#166534", fontWeight: 500 }}>
                ✓ Found {scannedFiles.length} document{scannedFiles.length !== 1 ? "s" : ""}
                {selectedFiles.size > 0 && selectedFiles.size !== scannedFiles.length && (
                  <span style={{ color: "#15803d", fontWeight: 400 }}> • {selectedFiles.size} selected</span>
                )}
              </p>
              {/* Select All / Deselect All buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={selectedFiles.size === scannedFiles.length}
                  style={{ padding: "4px 10px", fontSize: 12, backgroundColor: selectedFiles.size === scannedFiles.length ? "#e5e7eb" : "#dbeafe", color: selectedFiles.size === scannedFiles.length ? "#9ca3af" : "#1d4ed8", border: "none", borderRadius: 4, cursor: selectedFiles.size === scannedFiles.length ? "default" : "pointer" }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  disabled={selectedFiles.size === 0}
                  style={{ padding: "4px 10px", fontSize: 12, backgroundColor: selectedFiles.size === 0 ? "#e5e7eb" : "#fee2e2", color: selectedFiles.size === 0 ? "#9ca3af" : "#b91c1c", border: "none", borderRadius: 4, cursor: selectedFiles.size === 0 ? "default" : "pointer" }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {scannedFiles.length > 0 && (
              <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, overflow: "auto", padding: 8 }}>
                {renderFolderTree(folderTree)}
              </div>
            )}

            {isUploading && (
              <div style={{ marginTop: 12, flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>Indexing... {uploadProgress.current} of {uploadProgress.total}</div>
                <div style={{ height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(uploadProgress.current / uploadProgress.total) * 100}%`, backgroundColor: "#2563eb", transition: "width 0.2s" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions - Fixed at bottom */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexShrink: 0, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
          <button type="button" onClick={onClose} disabled={isUploading} style={{ padding: "8px 16px", fontSize: 14, backgroundColor: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: isUploading ? "not-allowed" : "pointer" }}>
            Cancel
          </button>
          {scanComplete && scannedFiles.length > 0 && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || selectedFiles.size === 0}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: isUploading || selectedFiles.size === 0 ? "#9ca3af" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: isUploading || selectedFiles.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              {isUploading
                ? `Indexing... ${uploadProgress.current}/${uploadProgress.total}`
                : selectedFiles.size === 0
                ? "Select files to index"
                : `📥 Index ${selectedFiles.size} Document${selectedFiles.size !== 1 ? "s" : ""}`
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- QuickLook Modal Component ---

interface QuickLookModalProps {
  document: StagedDocument;
  onClose: () => void;
}

function QuickLookModal({ document, onClose }: QuickLookModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
    document.fileType.toLowerCase()
  );
  const isPdf = document.fileType.toLowerCase() === "pdf";
  const isHtml = ["html", "htm"].includes(document.fileType.toLowerCase());

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // For HTML files, fetch the rendered HTML content
    if (isHtml) {
      (async () => {
        try {
          // First try the /html endpoint which returns converted content
          const res = await fetch(`${API_BASE}/document-import/documents/${document.id}/html`, {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("Failed to load document content");
          const data = await res.json();
          
          // Handle various response field names
          let content = data.htmlContent || data.html || data.content || "";
          
          // If no converted content, fall back to fetching raw file
          if (!content) {
            const previewRes = await fetch(
              `${API_BASE}/document-import/documents/${document.id}/preview`,
              { headers: getAuthHeaders() }
            );
            if (previewRes.ok) {
              content = await previewRes.text();
            }
          }
          
          setHtmlContent(content);
        } catch (err: any) {
          setError(err?.message ?? "Failed to load document");
        } finally {
          setLoading(false);
        }
      })();
    } else {
      // For other files, use the preview URL
      setPreviewUrl(`${API_BASE}/document-import/documents/${document.id}/preview`);
      setLoading(false);
    }
  }, [document.id, isHtml]);

  // Print handler - opens print dialog for the document
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print this document.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${document.fileName}</title>
        <style>
          @page {
            margin: 0.75in;
            size: letter;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #1f2937;
            max-width: 7in;
            margin: 0 auto;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
          h1 { font-size: 18pt; }
          h2 { font-size: 14pt; }
          h3 { font-size: 12pt; }
          p { margin: 0.75em 0; }
          ul, ol { margin: 0.75em 0; padding-left: 1.5em; }
          table { border-collapse: collapse; width: 100%; margin: 1em 0; }
          th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        ${htmlContent || ""}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          backgroundColor: "rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#ffffff" }}>{document.fileName}</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{document.breadcrumb.join(" / ")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isHtml && htmlContent && (
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                backgroundColor: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              🖨️ Print / Save PDF
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#111827",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div style={{ color: "#ffffff" }}>Loading preview...</div>
        ) : error ? (
          <div style={{ color: "#fca5a5" }}>{error}</div>
        ) : isHtml && htmlContent ? (
          /* Render HTML content inline with PDF-like styling */
          <div
            style={{
              width: "100%",
              maxWidth: 850,
              height: "100%",
              backgroundColor: "#ffffff",
              borderRadius: 8,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              overflow: "auto",
            }}
          >
            <div
              style={{
                padding: "40px 60px",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#1f2937",
              }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        ) : isImage && previewUrl ? (
          <img
            src={`${previewUrl}?token=${localStorage.getItem("accessToken")}`}
            alt={document.fileName}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          />
        ) : isPdf && previewUrl ? (
          <iframe
            src={`${previewUrl}?token=${localStorage.getItem("accessToken")}`}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: 900,
              border: "none",
              borderRadius: 8,
              backgroundColor: "#ffffff",
            }}
            title={document.fileName}
          />
        ) : (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 8,
              padding: 24,
              maxWidth: 600,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{document.fileName}</div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
              Preview not available for .{document.fileType} files
            </div>
            <a
              href={`${previewUrl}?token=${localStorage.getItem("accessToken")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                fontSize: 14,
                backgroundColor: "#2563eb",
                color: "#ffffff",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Import Modal Component ---

const SAFETY_CATEGORIES = [
  { id: "general-safety", name: "General Safety" },
  { id: "ppe", name: "Personal Protective Equipment" },
  { id: "hazard-communication", name: "Hazard Communication" },
  { id: "fall-protection", name: "Fall Protection" },
  { id: "electrical-safety", name: "Electrical Safety" },
  { id: "emergency-response", name: "Emergency Response" },
];

interface ImportModalProps {
  document: StagedDocument;
  onClose: () => void;
  onImport: (data: {
    importToType: string;
    importToCategory: string;
    displayTitle?: string;
    displayDescription?: string;
    oshaReference?: string;
  }) => void;
}

function ImportModal({ document, onClose, onImport }: ImportModalProps) {
  const [importToType] = useState("safety"); // For now, only safety manual
  const [importToCategory, setImportToCategory] = useState("");
  const [displayTitle, setDisplayTitle] = useState(document.fileName.replace(/\.[^/.]+$/, ""));
  const [displayDescription, setDisplayDescription] = useState("");
  const [oshaReference, setOshaReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!importToCategory) return;
    setIsSubmitting(true);
    await onImport({
      importToType,
      importToCategory,
      displayTitle: displayTitle.trim() || undefined,
      displayDescription: displayDescription.trim() || undefined,
      oshaReference: oshaReference.trim() || undefined,
    });
    setIsSubmitting(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 500,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Import to Safety Manual</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          Import "{document.fileName}" to the Safety Manual with custom metadata.
        </p>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Category *
          </label>
          <select
            value={importToCategory}
            onChange={(e) => setImportToCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              backgroundColor: "#ffffff",
            }}
          >
            <option value="">Select a category...</option>
            {SAFETY_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Display Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Display Title
          </label>
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
            placeholder="Enter a title for display"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Description
          </label>
          <textarea
            value={displayDescription}
            onChange={(e) => setDisplayDescription(e.target.value)}
            placeholder="Brief description of this document"
            rows={2}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>

        {/* OSHA Reference */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            OSHA Reference
          </label>
          <input
            type="text"
            value={oshaReference}
            onChange={(e) => setOshaReference(e.target.value)}
            placeholder="e.g., 29 CFR 1910.132"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* Source Path Info */}
        <div
          style={{
            padding: 12,
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
            <strong>Source:</strong> {document.breadcrumb.join(" / ")}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#16a34a" }}>
            The original file will remain accessible at its current location.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!importToCategory || isSubmitting}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: !importToCategory || isSubmitting ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: !importToCategory || isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Importing..." : "Import Document"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Bulk Import Modal Component ---

interface BulkImportModalProps {
  count: number;
  onClose: () => void;
  onImport: (data: { importToType: string; importToCategory: string }) => void;
}

function BulkImportModal({ count, onClose, onImport }: BulkImportModalProps) {
  const [importToType] = useState("safety");
  const [importToCategory, setImportToCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!importToCategory) return;
    setIsSubmitting(true);
    await onImport({ importToType, importToCategory });
    setIsSubmitting(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 450,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Bulk Import to Safety Manual</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          Import {count} selected document{count !== 1 ? "s" : ""} to the Safety Manual.
        </p>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Category *
          </label>
          <select
            value={importToCategory}
            onChange={(e) => setImportToCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              backgroundColor: "#ffffff",
            }}
          >
            <option value="">Select a category...</option>
            {SAFETY_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: 12,
            backgroundColor: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}>
            <strong>Note:</strong> Documents will be imported with their filenames as titles.
            You can edit individual documents after import to add descriptions and OSHA references.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!importToCategory || isSubmitting}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: !importToCategory || isSubmitting ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: !importToCategory || isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Importing..." : `Import ${count} Document${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Create Document Modal Component ---

interface CreateDocumentModalProps {
  onClose: () => void;
  onCreate: () => void;
}

function CreateDocumentModal({ onClose, onCreate }: CreateDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!htmlContent.trim()) {
      setError("Content is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/document-import/documents/create`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            title: title.trim(),
            htmlContent: htmlContent.trim(),
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            category: category.trim() || undefined,
            description: description.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to create document: ${res.status}`);
      }

      onCreate();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create document");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Create New Document</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          Create a new document from scratch with HTML content.
        </p>

        {error && (
          <div
            style={{
              padding: 12,
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#991b1b" }}>{error}</p>
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Privacy Policy"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* HTML Content */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            HTML Content *
          </label>
          <textarea
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            placeholder="<h1>Title</h1>\n<p>Content goes here...</p>"
            rows={10}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "monospace",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g., public:privacy-policy, legal, app-store"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Use <code>public:slug</code> format for documents accessible via public URL (e.g., /privacy)
          </p>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Legal, Policies, Help"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this document"
            rows={2}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: isSubmitting ? "#9ca3af" : "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Creating..." : "Create Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
