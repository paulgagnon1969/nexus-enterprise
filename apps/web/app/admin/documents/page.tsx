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

interface StagedDocument {
  id: string;
  fileName: string;
  filePath: string;
  breadcrumb: string[];
  fileType: string;
  fileSize: string;
  mimeType?: string;
  status: "ACTIVE" | "ARCHIVED" | "IMPORTED";
  scannedAt: string;
  archivedAt?: string;
  importedAt?: string;
  scanJob?: { id: string; scanPath: string };
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

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }

    Promise.all([loadDocuments(), loadStats(), loadScanJobs()]).finally(() =>
      setLoading(false)
    );
  }, [loadDocuments, loadStats, loadScanJobs]);

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
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading document import system...</p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Document Import</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>Document Import</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Scan external drives for documents and stage them for import into the documentation library.
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
            <StatBox label="Active" value={stats.byStatus.ACTIVE ?? 0} color="#16a34a" />
            <StatBox label="Archived" value={stats.byStatus.ARCHIVED ?? 0} color="#6b7280" />
            <StatBox label="Imported" value={stats.byStatus.IMPORTED ?? 0} color="#2563eb" />
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {/* Scan Button */}
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
            📁 Scan Folder
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
                {status === "ALL" ? "View All" : status === "ACTIVE" ? "Active" : "Archived"}
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
                ? "Click 'Scan Folder' to import documents from an external drive"
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

      {/* Scan Modal */}
      {showScanModal && (
        <ScanModal onClose={() => setShowScanModal(false)} onStart={handleStartScan} />
      )}

      {/* QuickLook Modal */}
      {quickLookDoc && (
        <QuickLookModal document={quickLookDoc} onClose={() => setQuickLookDoc(null)} />
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
}

function DocumentCard({ document, selected, onSelect, onQuickLook, onToggleStatus }: DocumentCardProps) {
  const isArchived = document.status === "ARCHIVED";
  const isImported = document.status === "IMPORTED";

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
              backgroundColor: isImported
                ? "#dbeafe"
                : isArchived
                ? "#f3f4f6"
                : "#dcfce7",
              color: isImported ? "#1e40af" : isArchived ? "#6b7280" : "#166534",
              fontWeight: 500,
            }}
          >
            {document.status}
          </span>
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
        {!isImported && (
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

// --- Scan Modal Component ---

interface ScanModalProps {
  onClose: () => void;
  onStart: (path: string) => void;
}

function ScanModal({ onClose, onStart }: ScanModalProps) {
  const [scanPath, setScanPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!scanPath.trim()) return;
    setIsSubmitting(true);
    await onStart(scanPath.trim());
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
        <h2 style={{ margin: 0, fontSize: 18 }}>Scan Folder for Documents</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          Enter the full path to a folder on an external drive or local filesystem. All supported
          document types will be discovered and staged for import.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Folder Path
          </label>
          <input
            type="text"
            value={scanPath}
            onChange={(e) => setScanPath(e.target.value)}
            placeholder="/Volumes/ExternalDrive/Documents"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
            autoFocus
          />
          <p style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>
            Example: /Volumes/4T Data/Company Documents
          </p>
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
            <strong>⚠️ Note:</strong> This will scan the folder recursively and may take several
            minutes for large directories. Supported formats: PDF, DOCX, XLSX, TXT, MD, images, and more.
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
            disabled={!scanPath.trim() || isSubmitting}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: !scanPath.trim() || isSubmitting ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: !scanPath.trim() || isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Starting..." : "Start Scan"}
          </button>
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

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // For preview, we'll construct the URL directly
    setPreviewUrl(`${API_BASE}/document-import/documents/${document.id}/preview`);
    setLoading(false);
  }, [document.id]);

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
    document.fileType.toLowerCase()
  );
  const isPdf = document.fileType.toLowerCase() === "pdf";
  const isText = ["txt", "md", "json", "xml", "csv", "yaml", "yml", "html", "htm"].includes(
    document.fileType.toLowerCase()
  );

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
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
