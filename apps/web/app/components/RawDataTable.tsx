"use client";

import { useState, useMemo, useEffect } from "react";

// ---------------------------------------------------------------------------
// Column definitions per source
// ---------------------------------------------------------------------------

type ColumnDef = { key: string; label: string; type: "string" | "date" | "currency" | "number" | "boolean" };

const HD_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "storeNumber", label: "Store #", type: "string" },
  { key: "transactionRef", label: "Transaction ID", type: "string" },
  { key: "registerNumber", label: "Register #", type: "string" },
  { key: "jobNameRaw", label: "Job Name (Raw)", type: "string" },
  { key: "jobName", label: "Job Name (Normalized)", type: "string" },
  { key: "sku", label: "SKU", type: "string" },
  { key: "description", label: "SKU Description", type: "string" },
  { key: "qty", label: "Qty", type: "number" },
  { key: "unitPrice", label: "Unit Price", type: "currency" },
  { key: "amount", label: "Net Amount", type: "currency" },
  { key: "department", label: "Department", type: "string" },
  { key: "category", label: "Class", type: "string" },
  { key: "subcategory", label: "Subclass", type: "string" },
  { key: "purchaser", label: "Purchaser", type: "string" },
];

const CHASE_COLUMNS: ColumnDef[] = [
  { key: "postingDate", label: "Posting Date", type: "date" },
  { key: "description", label: "Description", type: "string" },
  { key: "txnType", label: "Type", type: "string" },
  { key: "amount", label: "Amount", type: "currency" },
  { key: "runningBalance", label: "Balance", type: "currency" },
  { key: "checkOrSlip", label: "Check/Slip #", type: "string" },
];

const APPLE_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Transaction Date", type: "date" },
  { key: "clearingDate", label: "Clearing Date", type: "date" },
  { key: "description", label: "Description", type: "string" },
  { key: "merchant", label: "Merchant", type: "string" },
  { key: "cardCategory", label: "Category", type: "string" },
  { key: "amount", label: "Amount", type: "currency" },
  { key: "cardHolder", label: "Purchased By", type: "string" },
];

const PLAID_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "name", label: "Description", type: "string" },
  { key: "merchantName", label: "Merchant", type: "string" },
  { key: "amount", label: "Amount", type: "currency" },
  { key: "primaryCategory", label: "Category", type: "string" },
  { key: "detailedCategory", label: "Detailed Category", type: "string" },
  { key: "paymentChannel", label: "Payment Channel", type: "string" },
  { key: "transactionType", label: "Transaction Type", type: "string" },
  { key: "pending", label: "Pending", type: "boolean" },
];

// All columns from all sources (for mixed-source view)
const ALL_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "source", label: "Source", type: "string" },
  { key: "description", label: "Description", type: "string" },
  { key: "merchant", label: "Merchant", type: "string" },
  { key: "amount", label: "Amount", type: "currency" },
  { key: "category", label: "Category", type: "string" },
  { key: "storeNumber", label: "Store #", type: "string" },
  { key: "transactionRef", label: "Transaction ID", type: "string" },
  { key: "jobNameRaw", label: "Job Name (Raw)", type: "string" },
  { key: "jobName", label: "Job Name (Normalized)", type: "string" },
  { key: "sku", label: "SKU", type: "string" },
  { key: "qty", label: "Qty", type: "number" },
  { key: "unitPrice", label: "Unit Price", type: "currency" },
  { key: "department", label: "Department", type: "string" },
  { key: "subcategory", label: "Subclass", type: "string" },
  { key: "purchaser", label: "Purchaser", type: "string" },
  { key: "txnType", label: "Chase Type", type: "string" },
  { key: "runningBalance", label: "Chase Balance", type: "currency" },
  { key: "clearingDate", label: "Clearing Date", type: "date" },
  { key: "cardCategory", label: "Card Category", type: "string" },
  { key: "cardHolder", label: "Card Holder", type: "string" },
];

function getColumnsForSource(source: string | null): ColumnDef[] {
  switch (source) {
    case "HD_PRO_XTRA": return HD_COLUMNS;
    case "CHASE_BANK": return CHASE_COLUMNS;
    case "APPLE_CARD": return APPLE_COLUMNS;
    case "PLAID": return PLAID_COLUMNS;
    default: return ALL_COLUMNS;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCell(value: any, type: ColumnDef["type"]): string {
  if (value == null || value === "") return "—";
  switch (type) {
    case "date": {
      const d = typeof value === "string" ? value : String(value);
      return d.slice(0, 10);
    }
    case "currency":
      return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "number":
      return String(value);
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type RawDataTableProps = {
  /** Source filter: "HD_PRO_XTRA" | "CHASE_BANK" | "APPLE_CARD" | "PLAID" | null (all) */
  source: string | null;
  /**
   * Array of transaction records. Each record can be either:
   * - A flat ImportedTransaction/BankTransaction record (when from raw endpoint)
   * - A unified row with `extra` field (when from unified endpoint)
   */
  rows: Record<string, any>[];
  /** Optional column whitelist (for ColumnCustomizer integration) */
  visibleColumns?: string[];
  /** Sort field */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (field: string) => void;
};

export function RawDataTable({
  source,
  rows,
  visibleColumns,
  sortBy,
  sortDir,
  onSort,
}: RawDataTableProps) {
  const columns = useMemo(() => {
    const allCols = getColumnsForSource(source);
    if (visibleColumns && visibleColumns.length > 0) {
      return allCols.filter((c) => visibleColumns.includes(c.key));
    }
    return allCols;
  }, [source, visibleColumns]);

  // Flatten `extra` fields into top-level for rendering
  const flatRows = useMemo(() => {
    return rows.map((row) => {
      if (row.extra && typeof row.extra === "object") {
        return { ...row, ...row.extra };
      }
      return row;
    });
  }, [rows]);

  if (flatRows.length === 0) {
    return <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>No transactions to display.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => onSort?.(col.key)}
                style={{
                  padding: "6px 8px",
                  textAlign: col.type === "currency" || col.type === "number" ? "right" : "left",
                  cursor: onSort ? "pointer" : "default",
                  whiteSpace: "nowrap",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#374151",
                  userSelect: "none",
                }}
              >
                {col.label}
                {sortBy === col.key && (
                  <span style={{ marginLeft: 4, fontSize: 10 }}>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flatRows.map((row, idx) => (
            <tr
              key={row.id ?? idx}
              style={{
                borderBottom: "1px solid #f3f4f6",
                background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "5px 8px",
                    textAlign: col.type === "currency" || col.type === "number" ? "right" : "left",
                    whiteSpace: "nowrap",
                    color: row[col.key] == null ? "#d1d5db" : "#111827",
                    fontFamily: col.type === "currency" || col.type === "number" ? "monospace" : "inherit",
                  }}
                >
                  {formatCell(row[col.key], col.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disposition constants
// ---------------------------------------------------------------------------

const DISPOSITION_OPTIONS = [
  { value: "UNREVIEWED", label: "Unreviewed", color: "#f59e0b", bg: "#fffbeb" },
  { value: "PENDING_APPROVAL", label: "Pending Approval", color: "#3b82f6", bg: "#eff6ff" },
  { value: "ASSIGNED", label: "Assigned to Project", color: "#22c55e", bg: "#f0fdf4" },
  { value: "IGNORED", label: "Ignored", color: "#6b7280", bg: "#f3f4f6" },
  { value: "PERSONAL", label: "Personal Expense", color: "#a855f7", bg: "#faf5ff" },
  { value: "DUPLICATE", label: "Duplicate", color: "#ef4444", bg: "#fef2f2" },
  { value: "RETURNED", label: "Return/Refund", color: "#14b8a6", bg: "#f0fdfa" },
] as const;

function getDispositionStyle(value: string) {
  return DISPOSITION_OPTIONS.find((d) => d.value === value) ?? DISPOSITION_OPTIONS[0];
}

export { DISPOSITION_OPTIONS, getDispositionStyle };

// ---------------------------------------------------------------------------
// Raw Detail Modal — reusable modal for viewing a single transaction's raw data
// ---------------------------------------------------------------------------

type DispositionLogEntry = {
  id: string;
  previousDisposition: string;
  newDisposition: string;
  note: string;
  userName: string;
  createdAt: string;
};

type RawDetailModalProps = {
  open: boolean;
  onClose: () => void;
  source: string;
  data: Record<string, any> | null;
  sourceColumns?: Array<{ key: string; label: string; type: string }>;
  /** Transaction ID for disposition operations */
  transactionId?: string;
  /** Callback after disposition is saved */
  onDispositionSaved?: (transactionId: string, newDisposition: string) => void;
};

const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000")
  : "http://localhost:8000";

export function RawDetailModal({
  open,
  onClose,
  source,
  data,
  sourceColumns,
  transactionId,
  onDispositionSaved,
}: RawDetailModalProps) {
  const [disposition, setDisposition] = useState("UNREVIEWED");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logEntries, setLogEntries] = useState<DispositionLogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  // Reset state when modal opens with new data
  useEffect(() => {
    if (open && data) {
      setDisposition(data.disposition ?? data.extra?.disposition ?? "UNREVIEWED");
      setNote("");
      setSaveError(null);
      setSaveSuccess(false);
      setLogEntries([]);
      setLogExpanded(false);
    }
  }, [open, transactionId]);

  // Fetch disposition log when expanded
  useEffect(() => {
    if (!logExpanded || !transactionId) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setLogLoading(true);
    fetch(`${API_BASE}/banking/transactions/${transactionId}/disposition-log`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((entries) => setLogEntries(entries))
      .catch(() => {})
      .finally(() => setLogLoading(false));
  }, [logExpanded, transactionId]);

  if (!open || !data) return null;

  const cols = sourceColumns ?? getColumnsForSource(source);

  const currentStyle = getDispositionStyle(disposition);
  const isChanged = disposition !== (data.disposition ?? data.extra?.disposition ?? "UNREVIEWED");
  const noteValid = note.trim().length >= 3;
  const canSave = isChanged && noteValid && !saving;

  async function handleSaveDisposition() {
    if (!canSave || !transactionId) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${transactionId}/disposition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source, disposition, note: note.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Failed (${res.status})`);
      }
      setSaveSuccess(true);
      onDispositionSaved?.(transactionId, disposition);
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save disposition.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 800,
          maxHeight: "85vh",
          overflowY: "auto",
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            Raw Transaction Data — {source.replace(/_/g, " ")}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            ✕
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {cols.map((col: any) => (
              <tr key={col.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td
                  style={{
                    padding: "6px 10px",
                    fontWeight: 600,
                    color: "#4b5563",
                    width: "35%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </td>
                <td style={{ padding: "6px 10px", color: data[col.key] != null ? "#111827" : "#d1d5db" }}>
                  {formatCell(data[col.key], col.type as any)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Prescreen info if available */}
        {data.prescreenProjectId && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "#eff6ff",
              border: "1px solid #93c5fd",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", marginBottom: 4 }}>
              Prescreen Suggestion
            </div>
            <div style={{ fontSize: 12, color: "#374151" }}>
              Confidence: {((data.prescreenConfidence ?? 0) * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
              {data.prescreenReason}
            </div>
          </div>
        )}

        {/* ── Disposition & Notes Card ── */}
        {transactionId && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fafafa",
            }}
          >
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#111827" }}>
              Disposition & Notes
            </h4>

            {/* Disposition selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                Disposition
              </label>
              <select
                value={disposition}
                onChange={(e) => { setDisposition(e.target.value); setSaveSuccess(false); }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `2px solid ${currentStyle.color}`,
                  background: currentStyle.bg,
                  color: currentStyle.color,
                  fontSize: 13,
                  fontWeight: 700,
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                {DISPOSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Note textarea — mandatory */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                Disposition Note <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); setSaveSuccess(false); }}
                placeholder="Describe why this transaction is being dispositioned..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `1px solid ${note.length > 0 && !noteValid ? "#ef4444" : "#d1d5db"}`,
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              {note.length > 0 && !noteValid && (
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>Minimum 3 characters required.</div>
              )}
            </div>

            {/* Save button */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={handleSaveDisposition}
                disabled={!canSave}
                style={{
                  padding: "8px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: canSave ? "#0f172a" : "#d1d5db",
                  color: canSave ? "#fff" : "#9ca3af",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canSave ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Saving..." : "Save Disposition"}
              </button>
              {saveSuccess && (
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Saved successfully</span>
              )}
              {saveError && (
                <span style={{ fontSize: 12, color: "#ef4444" }}>{saveError}</span>
              )}
            </div>

            {/* Disposition history */}
            <div style={{ marginTop: 16 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setLogExpanded(!logExpanded)}
              >
                <span style={{ fontSize: 12, transform: logExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9654;</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Disposition History</span>
              </div>
              {logExpanded && (
                <div style={{ marginTop: 8 }}>
                  {logLoading && <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading...</div>}
                  {!logLoading && logEntries.length === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>No disposition history yet.</div>
                  )}
                  {logEntries.map((entry) => {
                    const prevStyle = getDispositionStyle(entry.previousDisposition);
                    const newStyle = getDispositionStyle(entry.newDisposition);
                    return (
                      <div
                        key={entry.id}
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, color: "#374151" }}>{entry.userName}</span>
                          <span style={{ color: "#9ca3af" }}>—</span>
                          <span style={{ color: "#9ca3af" }}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: prevStyle.bg, color: prevStyle.color }}>
                            {prevStyle.label}
                          </span>
                          <span style={{ color: "#9ca3af" }}>→</span>
                          <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: newStyle.bg, color: newStyle.color }}>
                            {newStyle.label}
                          </span>
                        </div>
                        <div style={{ color: "#4b5563", fontStyle: "italic" }}>
                          {entry.note}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { ALL_COLUMNS, getColumnsForSource };
export type { ColumnDef };
