"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PlanSheetViewer } from "./plan-sheet-viewer";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ---------- Types ----------

interface PlanSheet {
  id: string;
  pageNo: number;
  sheetId: string | null;
  title: string | null;
  section: string | null;
  status: string;
  thumbPath: string | null;
  standardPath: string | null;
  masterPath: string | null;
  thumbBytes: number;
  standardBytes: number;
  masterBytes: number;
  sortOrder: number;
}

interface PlanSetSummary {
  id: string;
  fileName: string;
  pageCount: number;
  status: string;
  createdAt: string;
  readySheetCount: number;
  processingSheetCount: number;
  coverThumbPath: string | null;
}

interface PlanSetDetail {
  id: string;
  projectId: string;
  fileName: string;
  pageCount: number;
  status: string;
  createdAt: string;
  planSheets: PlanSheet[];
}

interface Props {
  projectId: string;
}

// ---------- Helpers ----------

function getToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("accessToken")
    : null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Status badge ----------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    READY: { bg: "#dcfce7", fg: "#166534", label: "Ready" },
    PENDING: { bg: "#fef9c3", fg: "#854d0e", label: "Pending" },
    PROCESSING: { bg: "#dbeafe", fg: "#1e40af", label: "Processing…" },
    FAILED: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", fg: "#374151", label: status };

  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.fg,
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}

// ---------- Main component ----------

export function PlanSheetsTab({ projectId }: Props) {
  const [planSets, setPlanSets] = useState<PlanSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected plan set for detail view
  const [selectedSet, setSelectedSet] = useState<PlanSetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSheetIndex, setViewerSheetIndex] = useState(0);

  // Processing state
  const [processingUploadId, setProcessingUploadId] = useState<string | null>(
    null,
  );

  // Delete state
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Success message (auto-dismiss)
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setError(null);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMessage(null), 6000);
  }, []);

  // Fetch plan set list
  const loadPlanSets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/projects/${projectId}/plan-sheets`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error(`Failed to load plan sets (${res.status})`);
      const data = await res.json();
      setPlanSets(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message ?? "Failed to load plan sets");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPlanSets();
  }, [loadPlanSets]);

  // Load plan set detail (with sheets)
  const loadPlanSetDetail = useCallback(
    async (uploadId: string) => {
      try {
        setDetailLoading(true);
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/plan-sheets/${uploadId}`,
          { headers: authHeaders() },
        );
        if (!res.ok)
          throw new Error(`Failed to load plan set detail (${res.status})`);
        const data: PlanSetDetail = await res.json();
        setSelectedSet(data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load plan set");
      } finally {
        setDetailLoading(false);
      }
    },
    [projectId],
  );

  // Trigger processing
  const triggerProcessing = useCallback(
    async (uploadId: string) => {
      try {
        setProcessingUploadId(uploadId);
        setError(null);
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/plan-sheets/${uploadId}/process`,
          { method: "POST", headers: authHeaders() },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Failed (${res.status})`);
        }
        const data = await res.json();

        // Handle queued: false (e.g. Redis down)
        if (data && data.queued === false) {
          throw new Error(
            data.message || "Processing could not be queued. Please try again later.",
          );
        }

        // Show success feedback
        const sheetCount = data?.sheetCount ?? 0;
        showSuccess(
          `Processing queued — ${sheetCount} page${sheetCount !== 1 ? "s" : ""} will be rendered. This may take a minute.`,
        );

        // Navigate to detail view so the user sees progress + polling
        await loadPlanSetDetail(uploadId);
      } catch (err: any) {
        setError(err.message ?? "Failed to trigger processing");
      } finally {
        setProcessingUploadId(null);
      }
    },
    [projectId, loadPlanSetDetail, showSuccess],
  );

  // Delete an upload (full: sheets + BOM + PDF + record)
  const deleteUpload = useCallback(
    async (uploadId: string) => {
      try {
        setDeletingUploadId(uploadId);
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/plan-sheets/${uploadId}`,
          { method: "DELETE", headers: authHeaders() },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Delete failed (${res.status})`);
        }
        // If we were viewing this set, go back to list
        if (selectedSet?.id === uploadId) {
          setSelectedSet(null);
        }
        setConfirmDeleteId(null);
        await loadPlanSets();
      } catch (err: any) {
        setError(err.message ?? "Failed to delete upload");
      } finally {
        setDeletingUploadId(null);
      }
    },
    [projectId, loadPlanSets, selectedSet?.id],
  );

  // Poll for processing status when there are pending/processing sheets (detail view)
  useEffect(() => {
    if (!selectedSet) return;

    const hasPending = selectedSet.planSheets.some(
      (s) => s.status === "PENDING" || s.status === "PROCESSING",
    );
    if (!hasPending) return;

    const interval = setInterval(() => {
      void loadPlanSetDetail(selectedSet.id);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedSet, loadPlanSetDetail]);

  // Poll list view when any upload has sheets being processed
  useEffect(() => {
    if (selectedSet) return; // detail view has its own poll
    const hasProcessing = planSets.some((ps) => ps.processingSheetCount > 0);
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      void loadPlanSets();
    }, 6000);

    return () => clearInterval(interval);
  }, [selectedSet, planSets, loadPlanSets]);

  // Open viewer
  const openViewer = (index: number) => {
    setViewerSheetIndex(index);
    setViewerOpen(true);
  };

  // ---------- Render: Viewer overlay ----------
  if (viewerOpen && selectedSet) {
    const readySheets = selectedSet.planSheets.filter(
      (s) => s.status === "READY",
    );
    return (
      <PlanSheetViewer
        projectId={projectId}
        uploadId={selectedSet.id}
        sheets={readySheets}
        initialSheetIndex={Math.min(viewerSheetIndex, readySheets.length - 1)}
        onClose={() => setViewerOpen(false)}
      />
    );
  }

  // ---------- Render: Detail view (selected plan set) ----------
  if (selectedSet) {
    const sheets = selectedSet.planSheets;
    const readyCount = sheets.filter((s) => s.status === "READY").length;
    const totalSize = sheets.reduce(
      (sum, s) => sum + s.thumbBytes + s.standardBytes + s.masterBytes,
      0,
    );

    return (
      <div style={{ marginTop: 8 }}>
        {/* Back button + header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedSet(null)}
            style={{
              background: "none",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Back
          </button>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              {selectedSet.fileName}
            </h3>
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {readyCount}/{selectedSet.pageCount} sheets ready ·{" "}
              {formatBytes(totalSize)} total
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {readyCount < selectedSet.pageCount && (
              <button
                type="button"
                onClick={() => triggerProcessing(selectedSet.id)}
                disabled={processingUploadId === selectedSet.id}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "1px solid #2563eb",
                  background: readyCount === 0 ? "#2563eb" : "#eff6ff",
                  color: readyCount === 0 ? "#fff" : "#1d4ed8",
                  fontSize: 12,
                  cursor:
                    processingUploadId === selectedSet.id
                      ? "not-allowed"
                      : "pointer",
                  opacity: processingUploadId === selectedSet.id ? 0.6 : 1,
                }}
              >
                {processingUploadId === selectedSet.id
                  ? "Queuing…"
                  : readyCount === 0
                    ? "Process Sheets"
                    : "Reprocess Failed"}
              </button>
            )}
            {confirmDeleteId === selectedSet.id ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#b91c1c" }}>Delete this plan?</span>
                <button
                  type="button"
                  onClick={() => deleteUpload(selectedSet.id)}
                  disabled={deletingUploadId === selectedSet.id}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "1px solid #dc2626",
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 11,
                    cursor: deletingUploadId === selectedSet.id ? "not-allowed" : "pointer",
                    opacity: deletingUploadId === selectedSet.id ? 0.6 : 1,
                  }}
                >
                  {deletingUploadId === selectedSet.id ? "Deleting…" : "Yes, Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    background: "none",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(selectedSet.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "1px solid #fca5a5",
                  background: "none",
                  color: "#dc2626",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {successMessage && (
          <div
            style={{
              fontSize: 12,
              color: "#166534",
              background: "#dcfce7",
              padding: 8,
              borderRadius: 4,
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {successMessage}
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "#166534",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#b91c1c",
              background: "#fee2e2",
              padding: 8,
              borderRadius: 4,
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}

        {detailLoading && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Refreshing…
          </div>
        )}

        {/* Sheet card grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {sheets.map((sheet, i) => (
            <div
              key={sheet.id}
              onClick={() => {
                if (sheet.status === "READY") {
                  const readyIndex = sheets
                    .filter((s) => s.status === "READY")
                    .findIndex((s) => s.id === sheet.id);
                  openViewer(readyIndex >= 0 ? readyIndex : 0);
                }
              }}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 8,
                cursor: sheet.status === "READY" ? "pointer" : "default",
                transition: "box-shadow 0.15s",
                background: "#fff",
              }}
              onMouseEnter={(e) => {
                if (sheet.status === "READY") {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 4px 12px rgba(0,0,0,0.1)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Thumbnail placeholder */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  background: "#f3f4f6",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 6,
                  fontSize: 24,
                  color: "#9ca3af",
                }}
              >
                {sheet.status === "READY" ? "📄" : sheet.status === "PROCESSING" ? "⏳" : sheet.status === "FAILED" ? "❌" : "⬜"}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {sheet.sheetId || `Page ${sheet.pageNo}`}
                </span>
                <StatusBadge status={sheet.status} />
              </div>
              {sheet.title && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sheet.title}
                </div>
              )}
              {sheet.status === "READY" ? (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                  {formatBytes(sheet.standardBytes)} standard ·{" "}
                  {formatBytes(sheet.masterBytes)} HD
                </div>
              ) : sheet.status === "FAILED" ? (
                <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2 }}>
                  Processing failed — click "Reprocess" above
                </div>
              ) : sheet.status === "PROCESSING" ? (
                <div style={{ fontSize: 10, color: "#1e40af", marginTop: 2 }}>
                  Processing…
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Render: Plan set list ----------
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Plan Sheets
        </h2>
        <button
          type="button"
          onClick={() => loadPlanSets()}
          style={{
            background: "none",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Loading plan sets…
        </div>
      )}

      {successMessage && (
        <div
          style={{
            fontSize: 12,
            color: "#166534",
            background: "#dcfce7",
            padding: 8,
            borderRadius: 4,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {successMessage}
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "#166534",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#b91c1c",
            background: "#fee2e2",
            padding: 8,
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      {!loading && planSets.length === 0 && !error && (
        <div
          style={{
            fontSize: 13,
            color: "#6b7280",
            padding: "32px 0",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
          No plan sheets yet. Upload a construction PDF via the{" "}
          <strong>BOM &amp; Procure</strong> tab, then come back here to process
          and view the individual sheets.
        </div>
      )}

      {planSets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {planSets.map((ps) => (
            <div
              key={ps.id}
              onClick={() => loadPlanSetDetail(ps.id)}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "12px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#fff";
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  background: "#f3f4f6",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                📑
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ps.fileName}
                </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {ps.pageCount} pages · {ps.readySheetCount} sheets ready
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {ps.readySheetCount > 0 && ps.readySheetCount === ps.pageCount ? (
                  <StatusBadge status="READY" />
                ) : ps.processingSheetCount > 0 ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#dbeafe",
                      color: "#1e40af",
                      fontWeight: 600,
                    }}
                  >
                    Processing… {ps.readySheetCount > 0 ? `${ps.readySheetCount}/${ps.pageCount}` : ""}
                  </span>
                ) : ps.readySheetCount > 0 ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#fef9c3",
                      color: "#854d0e",
                      fontWeight: 600,
                    }}
                  >
                    {ps.readySheetCount}/{ps.pageCount} ready
                  </span>
                ) : ps.status === "READY" || ps.status === "COMPLETED" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerProcessing(ps.id);
                    }}
                    disabled={processingUploadId === ps.id}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #2563eb",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: 11,
                      cursor:
                        processingUploadId === ps.id
                          ? "not-allowed"
                          : "pointer",
                      opacity: processingUploadId === ps.id ? 0.6 : 1,
                    }}
                  >
                    {processingUploadId === ps.id
                      ? "Queuing…"
                      : "Process Sheets"}
                  </button>
                ) : (
                  <StatusBadge status={ps.status} />
                )}
                {/* Delete button */}
                {confirmDeleteId === ps.id ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", gap: 4, alignItems: "center" }}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteUpload(ps.id); }}
                      disabled={deletingUploadId === ps.id}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        border: "1px solid #dc2626",
                        background: "#dc2626",
                        color: "#fff",
                        fontSize: 10,
                        cursor: deletingUploadId === ps.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {deletingUploadId === ps.id ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        background: "none",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(ps.id); }}
                    title="Delete this plan"
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      border: "1px solid #fca5a5",
                      background: "none",
                      color: "#dc2626",
                      fontSize: 11,
                      cursor: "pointer",
                      opacity: 0.7,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
