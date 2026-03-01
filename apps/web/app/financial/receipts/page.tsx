"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────

type EmailReceiptStatus = "PENDING_OCR" | "PENDING_MATCH" | "MATCHED" | "ASSIGNED" | "UNASSIGNED";

type OcrData = {
  vendorName: string | null;
  vendorStoreNumber: string | null;
  vendorCity: string | null;
  vendorState: string | null;
  totalAmount: string | number | null;
  receiptDate: string | null;
  lineItemsJson: string | null;
  confidence: number | null;
};

type EmailReceipt = {
  id: string;
  senderEmail: string;
  subject: string | null;
  receivedAt: string;
  status: EmailReceiptStatus;
  matchConfidence: number | null;
  matchReason: string | null;
  attachmentUrls: string | null;
  project: { id: string; name: string } | null;
  ocrResult: OcrData | null;
  assignedBy: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  assignedAt: string | null;
};

type Summary = {
  pendingOcr: number;
  pendingMatch: number;
  matched: number;
  assigned: number;
  unassigned: number;
  total: number;
  needsAttention: number;
};

type ProjectPickerItem = { id: string; name: string };

type EmailReceiptConnector = {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapMailbox: string;
  status: "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";
  lastPolledAt: string | null;
  lastPollError: string | null;
  totalReceiptsIngested: number;
  receiptsCount: number;
  connectedBy: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

type Tab = "ALL" | EmailReceiptStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING_MATCH", label: "Pending Match" },
  { key: "MATCHED", label: "Matched" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "UNASSIGNED", label: "Unassigned" },
  { key: "PENDING_OCR", label: "Processing" },
];

const STATUS_COLORS: Record<EmailReceiptStatus, string> = {
  PENDING_OCR: "bg-gray-100 text-gray-600",
  PENDING_MATCH: "bg-amber-100 text-amber-700",
  MATCHED: "bg-blue-100 text-blue-700",
  ASSIGNED: "bg-green-100 text-green-700",
  UNASSIGNED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<EmailReceiptStatus, string> = {
  PENDING_OCR: "Processing",
  PENDING_MATCH: "Pending Match",
  MATCHED: "Matched",
  ASSIGNED: "Assigned",
  UNASSIGNED: "Unassigned",
};

const CONNECTOR_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-yellow-100 text-yellow-700",
  ERROR: "bg-red-100 text-red-700",
  DISCONNECTED: "bg-gray-100 text-gray-500",
};

const DEFAULT_CONNECTOR_FORM = {
  label: "",
  imapHost: "imap.gmail.com",
  imapPort: "993",
  imapUser: "",
  imapPassword: "",
  imapMailbox: "INBOX",
};

// ── Helpers ──────────────────────────────────────────────────────────

function getToken() {
  return typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
}

function formatCurrency(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Page ─────────────────────────────────────────────────────────────

export default function EmailReceiptsPage() {
  const [receipts, setReceipts] = useState<EmailReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<ProjectPickerItem[]>([]);
  const [tab, setTab] = useState<Tab>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EmailReceipt | null>(null);
  const [assignProjectId, setAssignProjectId] = useState("");

  // Connector management
  const [showConnectors, setShowConnectors] = useState(false);
  const [connectors, setConnectors] = useState<EmailReceiptConnector[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [connForm, setConnForm] = useState({ ...DEFAULT_CONNECTOR_FORM });
  const [connFormError, setConnFormError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string; mailboxes?: { path: string; name: string }[] } | null>(null);

  const fetchReceipts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tab !== "ALL") params.set("status", tab);
      params.set("limit", "50");

      const [listRes, summRes, projRes] = await Promise.all([
        fetch(`${API_BASE}/receipt-emails?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/receipt-emails/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (listRes.ok) {
        const data = await listRes.json();
        setReceipts(data.items ?? []);
        setTotal(data.total ?? 0);
      }
      if (summRes.ok) setSummary(await summRes.json());
      if (projRes.ok) {
        const data = await projRes.json();
        const items = (Array.isArray(data) ? data : data.projects ?? []).map(
          (p: any) => ({ id: p.id, name: p.name }),
        );
        setProjects(items);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // ── Connector CRUD ─────────────────────────────────────────────────

  const fetchConnectors = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setConnectorsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/receipt-email-connectors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConnectors(await res.json());
    } catch {} finally {
      setConnectorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showConnectors) fetchConnectors();
  }, [showConnectors, fetchConnectors]);

  async function handleCreateConnector() {
    const token = getToken();
    if (!token) return;
    setConnFormError(null);
    if (!connForm.label || !connForm.imapUser || !connForm.imapPassword) {
      setConnFormError("Label, email, and password are required");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/receipt-email-connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label: connForm.label,
          imapHost: connForm.imapHost,
          imapPort: Number(connForm.imapPort) || 993,
          imapUser: connForm.imapUser,
          imapPassword: connForm.imapPassword,
          imapMailbox: connForm.imapMailbox || "INBOX",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed (${res.status})`);
      }
      setShowAddForm(false);
      setConnForm({ ...DEFAULT_CONNECTOR_FORM });
      fetchConnectors();
    } catch (err: any) {
      setConnFormError(err?.message ?? "Failed to create connector");
    }
  }

  async function handleToggleConnector(id: string, newStatus: "ACTIVE" | "PAUSED") {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/receipt-email-connectors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchConnectors();
    } catch {}
  }

  async function handleDeleteConnector(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/receipt-email-connectors/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchConnectors();
    } catch {}
  }

  async function handleTestConnector(id: string) {
    const token = getToken();
    if (!token) return;
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/receipt-email-connectors/${id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult({ id, ...data });
      fetchConnectors();
    } catch (err: any) {
      setTestResult({ id, success: false, error: err?.message });
    } finally {
      setTestingId(null);
    }
  }

  async function handlePollConnector(id: string) {
    const token = getToken();
    if (!token) return;
    setPollingId(id);
    try {
      await fetch(`${API_BASE}/receipt-email-connectors/${id}/poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchConnectors();
      fetchReceipts();
    } catch {} finally {
      setPollingId(null);
    }
  }

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE}/receipt-emails/${selectedId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setSelectedDetail(data);
        setAssignProjectId(data?.project?.id || "");
      });
  }, [selectedId]);

  async function handleAssign() {
    if (!selectedId || !assignProjectId) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/receipt-emails/${selectedId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: assignProjectId }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setSelectedId(null);
      fetchReceipts();
    } catch (err: any) {
      setError(err?.message ?? "Failed to assign receipt");
    }
  }

  async function handleUnassign() {
    if (!selectedId) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/receipt-emails/${selectedId}/unassign`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setSelectedId(null);
      fetchReceipts();
    } catch (err: any) {
      setError(err?.message ?? "Failed to unassign receipt");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <PageCard>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link
          href="/financial"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 no-underline hover:bg-gray-100"
        >
          <span aria-hidden="true">&larr;</span> Financial
        </Link>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 m-0">Email Receipts</h2>
          <p className="text-xs text-gray-500 m-0">Supplier receipts captured from monitored email inboxes</p>
        </div>
        <button
          onClick={() => setShowConnectors(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ⚙️ Connectors
        </button>
      </div>

      {/* Summary badges */}
      {summary && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-sm">
            <span className="font-medium text-amber-700">{summary.needsAttention}</span>
            <span className="text-amber-600 ml-1">need attention</span>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-sm">
            <span className="font-medium text-green-700">{summary.assigned}</span>
            <span className="text-green-600 ml-1">assigned</span>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-sm">
            <span className="font-medium text-gray-700">{summary.total}</span>
            <span className="text-gray-600 ml-1">total</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {TABS.map((t) => {
          const count =
            t.key === "ALL"
              ? summary?.total
              : t.key === "PENDING_MATCH"
                ? summary?.pendingMatch
                : t.key === "MATCHED"
                  ? summary?.matched
                  : t.key === "ASSIGNED"
                    ? summary?.assigned
                    : t.key === "UNASSIGNED"
                      ? summary?.unassigned
                      : summary?.pendingOcr;

          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {count != null && count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading receipts…</div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No receipts found{tab !== "ALL" ? ` with status "${STATUS_LABELS[tab as EmailReceiptStatus]}"` : ""}.
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">Vendor</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Project</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Match</div>
          </div>

          {receipts.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors text-left ${
                selectedId === r.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
              }`}
            >
              <div className="col-span-3 font-medium text-gray-900 truncate">
                {r.ocrResult?.vendorName || r.senderEmail}
                {r.ocrResult?.vendorStoreNumber && (
                  <span className="text-gray-400 ml-1">#{r.ocrResult.vendorStoreNumber}</span>
                )}
              </div>
              <div className="col-span-2 text-gray-700">
                {formatCurrency(r.ocrResult?.totalAmount)}
              </div>
              <div className="col-span-2 text-gray-500">
                {formatDate(r.ocrResult?.receiptDate || r.receivedAt)}
              </div>
              <div className="col-span-2 text-gray-500 truncate">
                {r.project?.name || "—"}
              </div>
              <div className="col-span-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              <div className="col-span-1 text-gray-400 text-xs">
                {r.matchConfidence ? `${(r.matchConfidence * 100).toFixed(0)}%` : "—"}
              </div>
            </button>
          ))}

          <div className="text-xs text-gray-400 pt-2 px-3">
            Showing {receipts.length} of {total} receipts
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedDetail.ocrResult?.vendorName || "Receipt Details"}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    From: {selectedDetail.senderEmail}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Status badge */}
              <div className="mb-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedDetail.status]}`}>
                  {STATUS_LABELS[selectedDetail.status]}
                </span>
              </div>

              {/* OCR data */}
              {selectedDetail.ocrResult && (
                <div className="space-y-3 mb-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Total</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatCurrency(selectedDetail.ocrResult.totalAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Date</div>
                      <div className="text-sm text-gray-900">
                        {formatDate(selectedDetail.ocrResult.receiptDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Store</div>
                      <div className="text-sm text-gray-900">
                        {selectedDetail.ocrResult.vendorName || "—"}
                        {selectedDetail.ocrResult.vendorStoreNumber && ` #${selectedDetail.ocrResult.vendorStoreNumber}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase">Location</div>
                      <div className="text-sm text-gray-900">
                        {[selectedDetail.ocrResult.vendorCity, selectedDetail.ocrResult.vendorState]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </div>
                  </div>

                  {selectedDetail.ocrResult.confidence != null && (
                    <div className="text-xs text-gray-400">
                      OCR confidence: {(selectedDetail.ocrResult.confidence * 100).toFixed(0)}%
                    </div>
                  )}

                  {/* Line items */}
                  {selectedDetail.ocrResult.lineItemsJson && (() => {
                    try {
                      const items = JSON.parse(selectedDetail.ocrResult.lineItemsJson);
                      if (!Array.isArray(items) || items.length === 0) return null;
                      return (
                        <div>
                          <div className="text-xs text-gray-500 uppercase mb-1">Line Items</div>
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {items.map((item: any, i: number) => (
                              <div
                                key={i}
                                className={`flex justify-between px-3 py-1.5 text-sm ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                              >
                                <span className="text-gray-700 truncate flex-1 mr-2">
                                  {item.description}
                                  {item.sku && <span className="text-gray-400 ml-1">({item.sku})</span>}
                                </span>
                                <span className="text-gray-500 whitespace-nowrap">
                                  {item.quantity > 1 && `${item.quantity}× `}
                                  {formatCurrency(item.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
              )}

              {/* Match reason */}
              {selectedDetail.matchReason && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  <span className="font-medium">Auto-match:</span> {selectedDetail.matchReason}
                  {selectedDetail.matchConfidence && (
                    <span className="ml-1">({(selectedDetail.matchConfidence * 100).toFixed(0)}% confidence)</span>
                  )}
                </div>
              )}

              {/* Current project */}
              {selectedDetail.project && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 uppercase mb-1">Current Project</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedDetail.project.name}
                  </div>
                </div>
              )}

              {/* Assignment actions */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="text-xs text-gray-500 uppercase mb-1">
                  {selectedDetail.status === "ASSIGNED" ? "Reassign or Unassign" : "Assign to Project"}
                </div>
                <select
                  value={assignProjectId}
                  onChange={(e) => setAssignProjectId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <button
                    onClick={handleAssign}
                    disabled={!assignProjectId}
                    className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {selectedDetail.status === "ASSIGNED" ? "Reassign" : "Assign"}
                  </button>
                  {(selectedDetail.status === "ASSIGNED" || selectedDetail.status === "MATCHED") && (
                    <button
                      onClick={handleUnassign}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Unassign
                    </button>
                  )}
                </div>

                {selectedDetail.assignedBy && (
                  <div className="text-xs text-gray-400">
                    Last assigned by{" "}
                    {selectedDetail.assignedBy.firstName
                      ? `${selectedDetail.assignedBy.firstName} ${selectedDetail.assignedBy.lastName || ""}`
                      : selectedDetail.assignedBy.email}
                    {selectedDetail.assignedAt && ` on ${formatDate(selectedDetail.assignedAt)}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Connector Management Modal */}
      {showConnectors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowConnectors(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-full max-w-2xl max-h-[80vh] bg-white rounded-xl shadow-xl overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Modal header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Email Connectors</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Configure email inboxes to monitor for receipts
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    + Add Connector
                  </button>
                  <button
                    onClick={() => setShowConnectors(false)}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Add connector form */}
              {showAddForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">New Email Connector</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Label</label>
                      <input
                        value={connForm.label}
                        onChange={(e) => setConnForm({ ...connForm, label: e.target.value })}
                        placeholder="e.g. HD Receipts Inbox"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">IMAP Host</label>
                      <input
                        value={connForm.imapHost}
                        onChange={(e) => setConnForm({ ...connForm, imapHost: e.target.value })}
                        placeholder="imap.gmail.com"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">IMAP Port</label>
                      <input
                        value={connForm.imapPort}
                        onChange={(e) => setConnForm({ ...connForm, imapPort: e.target.value })}
                        placeholder="993"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Email Address</label>
                      <input
                        value={connForm.imapUser}
                        onChange={(e) => setConnForm({ ...connForm, imapUser: e.target.value })}
                        placeholder="ncc-email@nfsgrp.com"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Password / App Password</label>
                      <input
                        type="password"
                        value={connForm.imapPassword}
                        onChange={(e) => setConnForm({ ...connForm, imapPassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Mailbox</label>
                      <input
                        value={connForm.imapMailbox}
                        onChange={(e) => setConnForm({ ...connForm, imapMailbox: e.target.value })}
                        placeholder="INBOX"
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  {connFormError && (
                    <div className="mt-2 text-sm text-red-600">{connFormError}</div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleCreateConnector}
                      className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Save Connector
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setConnFormError(null); }}
                      className="px-4 py-1.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Connectors list */}
              {connectorsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading connectors…</div>
              ) : connectors.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No connectors configured. Add one to start monitoring an email inbox.
                </div>
              ) : (
                <div className="space-y-3">
                  {connectors.filter((c) => c.status !== "DISCONNECTED").map((c) => (
                    <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{c.label}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONNECTOR_STATUS_COLORS[c.status] || "bg-gray-100 text-gray-500"}`}>
                              {c.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {c.imapUser} • {c.imapHost}:{c.imapPort} • {c.imapMailbox}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTestConnector(c.id)}
                            disabled={testingId === c.id}
                            className="px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title="Test connection"
                          >
                            {testingId === c.id ? "…" : "🔌 Test"}
                          </button>
                          <button
                            onClick={() => handlePollConnector(c.id)}
                            disabled={pollingId === c.id || c.status !== "ACTIVE"}
                            className="px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title="Poll now"
                          >
                            {pollingId === c.id ? "…" : "📥 Poll"}
                          </button>
                          <button
                            onClick={() => handleToggleConnector(c.id, c.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                              c.status === "ACTIVE"
                                ? "border-yellow-200 text-yellow-700 hover:bg-yellow-50"
                                : "border-green-200 text-green-700 hover:bg-green-50"
                            }`}
                          >
                            {c.status === "ACTIVE" ? "⏸ Pause" : "▶ Enable"}
                          </button>
                          <button
                            onClick={() => handleDeleteConnector(c.id)}
                            className="px-2.5 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove connector"
                          >
                            🗑
                          </button>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex gap-4 text-xs text-gray-500 mt-2">
                        <span>{c.totalReceiptsIngested} receipts ingested</span>
                        <span>Last polled: {c.lastPolledAt ? formatDate(c.lastPolledAt) : "never"}</span>
                        {c.connectedBy && (
                          <span>Added by {c.connectedBy.firstName || c.connectedBy.email}</span>
                        )}
                      </div>

                      {/* Error display */}
                      {c.lastPollError && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                          Error: {c.lastPollError}
                        </div>
                      )}

                      {/* Test result */}
                      {testResult && testResult.id === c.id && (
                        <div className={`mt-2 text-xs rounded px-2 py-1 ${testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {testResult.success
                            ? `✓ Connection successful! Found ${testResult.mailboxes?.length || 0} mailbox(es): ${testResult.mailboxes?.map((m) => m.path).join(", ") || "none"}`
                            : `✗ Connection failed: ${testResult.error}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}
