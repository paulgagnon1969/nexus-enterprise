"use client";

import { useState, useEffect, useCallback } from "react";

interface BatchSummary {
  batchId: string;
  batchLabel: string | null;
  kind: string;
  tag: string | null;
  entryCount: number;
  totalRcv: number;
  unitCost: number | null;
  activeCount: number;
  rejectedCount: number;
  createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
  createdAt: string;
  entryIds: string[];
}

interface ReconBatchManagerModalProps {
  projectId: string;
  apiBase: string;
  onClose: () => void;
  onMutate: () => void; // Called after undo/restore to refresh PETL data
}

const formatMoney = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export default function ReconBatchManagerModal({
  projectId,
  apiBase,
  onClose,
  onMutate,
}: ReconBatchManagerModalProps) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // batchId of in-progress action
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null);

  const fetchBatches = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/projects/${projectId}/petl/reconciliation/batches`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load batches.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, projectId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleUndo = async (batchId: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setBusy(batchId);
    try {
      const res = await fetch(
        `${apiBase}/projects/${projectId}/petl/reconciliation/batches/${batchId}/undo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Undo failed (${res.status}) ${text}`);
      }
      setConfirmUndo(null);
      await fetchBatches();
      onMutate();
    } catch (err: any) {
      setError(err?.message ?? "Undo failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (batchId: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    setBusy(batchId);
    try {
      const res = await fetch(
        `${apiBase}/projects/${projectId}/petl/reconciliation/batches/${batchId}/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Restore failed (${res.status}) ${text}`);
      }
      await fetchBatches();
      onMutate();
    } catch (err: any) {
      setError(err?.message ?? "Restore failed.");
    } finally {
      setBusy(null);
    }
  };

  const kindLabel = (kind: string) => {
    switch (kind) {
      case "CREDIT": return "Credit";
      case "ADD": return "Add";
      case "CHANGE_ORDER_CLIENT_PAY": return "CO Client Pay";
      case "REIMBURSE_OWNER": return "Reimburse Owner";
      default: return kind;
    }
  };

  const tagLabel = (tag: string | null) => {
    if (!tag) return "";
    switch (tag) {
      case "SUPPLEMENT": return "Supplement";
      case "CHANGE_ORDER": return "Change Order";
      case "OTHER": return "Other";
      case "WARRANTY": return "Warranty";
      default: return tag;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          width: "94%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              Batch Updates
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              View and manage reconciliation batches. Undo reverts all entries in a batch.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              color: "#6b7280",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "8px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
            Loading batches…
          </div>
        )}

        {/* Empty state */}
        {!loading && batches.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            No batch updates yet. Batch IDs are assigned when you use "Copy to Similar Lines".
          </div>
        )}

        {/* Batch list */}
        {!loading && batches.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {batches.map((batch) => {
              const isUndone = batch.activeCount === 0 && batch.rejectedCount > 0;
              const isPartial = batch.activeCount > 0 && batch.rejectedCount > 0;
              const isBusy = busy === batch.batchId;

              return (
                <div
                  key={batch.batchId}
                  style={{
                    border: `1px solid ${isUndone ? "#fecaca" : "#e5e7eb"}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: isUndone ? "#fef2f2" : "#ffffff",
                    opacity: isUndone ? 0.75 : 1,
                  }}
                >
                  {/* Top row: label + status */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isUndone ? "#991b1b" : "#111827",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {batch.batchLabel ?? `Batch ${batch.batchId.slice(0, 8)}`}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#6b7280",
                          marginTop: 3,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span>{kindLabel(batch.kind)}</span>
                        {batch.tag && (
                          <span
                            style={{
                              background: "#dbeafe",
                              color: "#1d4ed8",
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                            }}
                          >
                            {tagLabel(batch.tag)}
                          </span>
                        )}
                        <span>{batch.entryCount} entries</span>
                        <span>${formatMoney(batch.totalRcv)}</span>
                        {batch.unitCost != null && (
                          <span>@ ${formatMoney(batch.unitCost)}/unit</span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    {isUndone && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#991b1b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        UNDONE
                      </span>
                    )}
                    {isPartial && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fef3c7",
                          color: "#92400e",
                          whiteSpace: "nowrap",
                        }}
                      >
                        PARTIAL ({batch.activeCount} active)
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      {batch.createdBy
                        ? `${batch.createdBy.firstName ?? ""} ${batch.createdBy.lastName ?? ""}`.trim()
                        : "System"}{" "}
                      · {formatDate(batch.createdAt)} {formatTime(batch.createdAt)}
                    </span>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {!isUndone && (
                        <>
                          {confirmUndo === batch.batchId ? (
                            <>
                              <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                                Undo all {batch.activeCount} entries?
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleUndo(batch.batchId)}
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #dc2626",
                                  background: "#dc2626",
                                  color: "#fff",
                                  fontSize: 11,
                                  cursor: isBusy ? "wait" : "pointer",
                                  opacity: isBusy ? 0.6 : 1,
                                }}
                              >
                                {isBusy ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmUndo(null)}
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  background: "#f9fafb",
                                  color: "#374151",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmUndo(batch.batchId)}
                              style={{
                                padding: "3px 10px",
                                borderRadius: 6,
                                border: "1px solid #ef4444",
                                background: "#fff",
                                color: "#dc2626",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Undo Batch
                            </button>
                          )}
                        </>
                      )}

                      {isUndone && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRestore(batch.batchId)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            border: "1px solid #16a34a",
                            background: "#fff",
                            color: "#16a34a",
                            fontSize: 11,
                            cursor: isBusy ? "wait" : "pointer",
                            opacity: isBusy ? 0.6 : 1,
                          }}
                        >
                          {isBusy ? "…" : "Restore Batch"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              color: "#374151",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
