"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────

interface PortalProject {
  id: string;
  name: string;
  status: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode?: string;
  company: { id: string; name: string };
  visibility: string;
  createdAt: string;
  updatedAt: string;
  clientContact?: { name: string; email?: string; phone?: string } | null;
  schedule: ScheduleTask[];
  recentMessages?: MessageThread[];
  invoices?: PortalInvoiceSummary[];
  files?: PortalFile[];
  hasFullAccess?: boolean;
}

interface ScheduleTask {
  id: string;
  name: string;
  trade?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
}

interface MessageThread {
  id: string;
  subject?: string;
  updatedAt: string;
  lastMessage?: { id: string; body: string; createdAt: string } | null;
}

interface PortalInvoiceSummary {
  id: string;
  invoiceNo?: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  issuedAt?: string;
  dueAt?: string;
  memo?: string;
  billToName?: string;
}

interface PortalFile {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  storageUrl?: string;
  createdAt: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNo?: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  issuedAt?: string;
  dueAt?: string;
  memo?: string;
  billToName?: string;
  billToEmail?: string;
  billToPhone?: string;
  billToAddress?: string;
  billToCity?: string;
  billToState?: string;
  billToZip?: string;
  project: { id: string; name: string; addressLine1: string; city: string; state: string; postalCode?: string };
  company: { id: string; name: string };
  lineItems: InvoiceLineItem[];
  attachments: InvoiceAttachment[];
  payments: InvoicePayment[];
}

interface InvoiceLineItem {
  id: string;
  description: string;
  qty?: number;
  unitPrice?: number;
  amount: number;
  unitCode?: string;
  sortOrder: number;
}

interface InvoiceAttachment {
  id: string;
  fileName: string;
  fileUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  paidAt?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const statusBadge = (status: string): { label: string; bg: string; color: string } => {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ISSUED: { label: "Issued", bg: "rgba(59,130,246,0.15)", color: "#93c5fd" },
    PARTIALLY_PAID: { label: "Partially Paid", bg: "rgba(234,179,8,0.15)", color: "#fde047" },
    PAID: { label: "Paid", bg: "rgba(34,197,94,0.15)", color: "#86efac" },
  };
  return map[status] ?? { label: status, bg: "rgba(100,116,139,0.15)", color: "#94a3b8" };
};

const projectStatusBadge = (status: string): { bg: string; color: string } => {
  const s = status.toUpperCase();
  const map: Record<string, { bg: string; color: string }> = {
    ACTIVE: { bg: "rgba(34,197,94,0.15)", color: "#86efac" },
    OPEN: { bg: "rgba(34,197,94,0.15)", color: "#86efac" },
    COMPLETE: { bg: "rgba(59,130,246,0.15)", color: "#93c5fd" },
    COMPLETED: { bg: "rgba(59,130,246,0.15)", color: "#93c5fd" },
    ON_HOLD: { bg: "rgba(234,179,8,0.15)", color: "#fde047" },
    CLOSED: { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
    WARRANTY: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
  };
  return map[s] ?? { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" };
};

const fileIcon = (mimeType?: string): string => {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "📦";
  return "📄";
};

// ── Styles ─────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
  color: "#f8fafc",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const CARD: React.CSSProperties = {
  background: "rgba(30,41,59,0.7)",
  border: "1px solid #1e293b",
  borderRadius: 12,
  overflow: "hidden",
};

const CARD_HEADER: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
};

const CARD_BODY: React.CSSProperties = {
  padding: "16px 20px",
};

const TAB_NAV: React.CSSProperties = {
  maxWidth: 1100, margin: "0 auto", padding: "0 32px",
  borderBottom: "1px solid #1e293b",
  display: "flex", gap: 0,
};

const TAB_INACTIVE: React.CSSProperties = {
  padding: "12px 20px", fontSize: 13, fontWeight: 500,
  color: "#64748b", background: "transparent", border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
};

// ── Component ──────────────────────────────────────────────────────

export default function ClientPortalProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [project, setProject] = useState<PortalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Section collapse states
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [invoicesOpen, setInvoicesOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // Invoice detail
  const [activeInvoice, setActiveInvoice] = useState<InvoiceDetail | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";

  const fetchProject = useCallback(async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API_BASE}/projects/portal/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }
      if (!res.ok) {
        setError(`Failed to load project (${res.status}).`);
        return;
      }
      const data = await res.json();
      setProject(data);
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const loadInvoiceDetail = async (invoiceId: string) => {
    const token = getToken();
    if (!token) return;
    setInvoiceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/projects/portal/${projectId}/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveInvoice(data);
      }
    } catch {
      // ignore
    } finally {
      setInvoiceLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: 14 }}>Loading project…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
          <p style={{ color: "#fca5a5", fontSize: 14, marginBottom: 16 }}>{error || "Project not found."}</p>
          <button
            onClick={() => router.push("/client-portal")}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 14, cursor: "pointer",
            }}
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const invoices = project.invoices ?? [];
  const files = project.files ?? [];
  const schedule = project.schedule ?? [];
  const messages = project.recentMessages ?? [];
  const pStatus = projectStatusBadge(project.status);

  // ── Invoice Detail View ──────────────────────────────────────────

  if (activeInvoice) {
    return (
      <div style={PAGE}>
        <style>{`
          @media print {
            body { background: #fff !important; color: #000 !important; }
            .no-print { display: none !important; }
            .print-invoice { background: #fff !important; color: #000 !important; border: none !important; box-shadow: none !important; }
            .print-invoice * { color: #000 !important; }
            .print-invoice table { border-collapse: collapse; }
            .print-invoice th, .print-invoice td { border-bottom: 1px solid #d1d5db !important; }
          }
        `}</style>

        <div className="no-print" style={{ maxWidth: 900, margin: "0 auto", padding: "18px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setActiveInvoice(null)}
              style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid #334155",
                background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer",
              }}
            >
              ← Back to Project
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: "8px 16px", borderRadius: 6, border: "none",
                background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Print Invoice
            </button>
          </div>
        </div>

        <div className="print-invoice" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 32px 60px" }}>
          {/* Invoice header */}
          <div style={{ ...CARD, padding: 32 }}>
            {/* Status banner */}
            {(() => {
              const badge = statusBadge(activeInvoice.status);
              let bannerBg = "rgba(59,130,246,0.1)";
              let bannerBorder = "#3b82f6";
              let bannerText = `Invoice ${activeInvoice.invoiceNo ?? ""}`;
              if (activeInvoice.status === "PAID") {
                bannerBg = "rgba(34,197,94,0.1)";
                bannerBorder = "#22c55e";
                bannerText = `PAID — ${activeInvoice.invoiceNo ?? "Invoice"}`;
              } else if (activeInvoice.status === "PARTIALLY_PAID") {
                bannerBg = "rgba(234,179,8,0.1)";
                bannerBorder = "#eab308";
                bannerText = `Partially Paid (${formatMoney(activeInvoice.paidAmount)} of ${formatMoney(activeInvoice.totalAmount)})`;
              } else if (activeInvoice.dueAt) {
                const due = new Date(activeInvoice.dueAt);
                const overdue = due < new Date();
                if (overdue) {
                  bannerBg = "rgba(239,68,68,0.1)";
                  bannerBorder = "#ef4444";
                  bannerText = `OVERDUE — Due ${formatDate(activeInvoice.dueAt)}`;
                } else {
                  bannerText = `Due ${formatDate(activeInvoice.dueAt)}`;
                }
              }
              return (
                <div style={{
                  padding: "12px 16px", borderRadius: 8, marginBottom: 24,
                  background: bannerBg, border: `1px solid ${bannerBorder}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{bannerText}</span>
                  <span style={{
                    ...badge, padding: "4px 12px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
                    background: badge.bg, color: badge.color,
                  }}>
                    {badge.label}
                  </span>
                </div>
              );
            })()}

            {/* Company + Invoice meta */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
                  {activeInvoice.company.name}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {activeInvoice.project.addressLine1}, {activeInvoice.project.city}, {activeInvoice.project.state} {activeInvoice.project.postalCode ?? ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
                  {activeInvoice.invoiceNo ?? "Invoice"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Issued: {formatDate(activeInvoice.issuedAt)}
                </div>
                {activeInvoice.dueAt && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Due: {formatDate(activeInvoice.dueAt)}
                  </div>
                )}
              </div>
            </div>

            {/* Bill To */}
            {activeInvoice.billToName && (
              <div style={{ marginBottom: 24, padding: "12px 16px", background: "rgba(15,23,42,0.5)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Bill To</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{activeInvoice.billToName}</div>
                {activeInvoice.billToAddress && (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    {activeInvoice.billToAddress}
                    {activeInvoice.billToCity && `, ${activeInvoice.billToCity}`}
                    {activeInvoice.billToState && `, ${activeInvoice.billToState}`}
                    {activeInvoice.billToZip && ` ${activeInvoice.billToZip}`}
                  </div>
                )}
                {activeInvoice.billToEmail && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>{activeInvoice.billToEmail}</div>
                )}
                {activeInvoice.billToPhone && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>{activeInvoice.billToPhone}</div>
                )}
              </div>
            )}

            {/* Project reference */}
            <div style={{ marginBottom: 24, padding: "12px 16px", background: "rgba(15,23,42,0.5)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Project</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{activeInvoice.project.name}</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                {activeInvoice.project.addressLine1}, {activeInvoice.project.city}, {activeInvoice.project.state}
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "10px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>#</th>
                    <th style={{ textAlign: "left", padding: "10px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Unit Price</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvoice.lineItems.map((li, idx) => (
                    <tr key={li.id} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={{ padding: "10px 8px", color: "#64748b" }}>{idx + 1}</td>
                      <td style={{ padding: "10px 8px", color: "#e2e8f0" }}>{li.description}</td>
                      <td style={{ padding: "10px 8px", color: "#cbd5e1", textAlign: "right" }}>
                        {li.qty != null ? `${li.qty}${li.unitCode ? ` ${li.unitCode}` : ""}` : ""}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#cbd5e1", textAlign: "right" }}>
                        {li.unitPrice != null ? formatMoney(li.unitPrice) : ""}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#f1f5f9", fontWeight: 600, textAlign: "right" }}>
                        {formatMoney(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ marginTop: 20, borderTop: "2px solid #334155", paddingTop: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
                  <span style={{ color: "#94a3b8" }}>Total</span>
                  <span style={{ color: "#f1f5f9", fontWeight: 700, minWidth: 100, textAlign: "right" }}>{formatMoney(activeInvoice.totalAmount)}</span>
                </div>
                {activeInvoice.paidAmount > 0 && (
                  <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
                    <span style={{ color: "#86efac" }}>Paid</span>
                    <span style={{ color: "#86efac", fontWeight: 600, minWidth: 100, textAlign: "right" }}>−{formatMoney(activeInvoice.paidAmount)}</span>
                  </div>
                )}
                {activeInvoice.balanceDue > 0 && (
                  <div style={{ display: "flex", gap: 24, fontSize: 16, marginTop: 4 }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 700 }}>Balance Due</span>
                    <span style={{ color: "#f1f5f9", fontWeight: 700, minWidth: 100, textAlign: "right" }}>{formatMoney(activeInvoice.balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Memo */}
            {activeInvoice.memo && (
              <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(15,23,42,0.5)", borderRadius: 8, fontSize: 13, color: "#94a3b8" }}>
                <strong style={{ color: "#cbd5e1" }}>Memo:</strong> {activeInvoice.memo}
              </div>
            )}

            {/* Attachments */}
            {activeInvoice.attachments.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Supporting Documents</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {activeInvoice.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={a.fileUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 6, background: "rgba(59,130,246,0.1)",
                        border: "1px solid rgba(59,130,246,0.2)", color: "#93c5fd",
                        fontSize: 12, textDecoration: "none",
                      }}
                    >
                      {fileIcon(a.mimeType)} {a.fileName}
                      {a.sizeBytes ? ` (${formatBytes(a.sizeBytes)})` : ""}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Payment History */}
            {activeInvoice.payments.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment History</div>
                {activeInvoice.payments.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e293b", fontSize: 13 }}>
                    <span style={{ color: "#94a3b8" }}>
                      {formatDate(p.paidAt)} · {p.method.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#86efac", fontWeight: 600 }}>{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Project View ────────────────────────────────────────────

  return (
    <div style={PAGE}>
      {/* Header */}
      <header style={{
        maxWidth: 900, margin: "0 auto", padding: "18px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid #1e293b",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 28, width: "auto" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Project Portal</span>
        </div>
        <button
          onClick={() => router.push("/client-portal")}
          style={{
            padding: "7px 14px", borderRadius: 6, border: "1px solid #334155",
            background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer",
          }}
        >
          ← All Projects
        </button>
      </header>

      {/* Tab Nav */}
      <nav style={TAB_NAV}>
        <button onClick={() => router.push("/client-portal")} style={TAB_INACTIVE}>Projects</button>
        <button onClick={() => router.push("/client-portal/finance")} style={TAB_INACTIVE}>Finance</button>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 32px 60px" }}>
        {/* Project Hero */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#f1f5f9" }}>{project.name}</h1>
            <span style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.5px",
              background: pStatus.bg, color: pStatus.color,
            }}>
              {project.status}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "#64748b" }}>
            {project.addressLine1}
            {project.addressLine2 ? `, ${project.addressLine2}` : ""}
            , {project.city}, {project.state} {project.postalCode ?? ""}
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
            Contractor: <strong style={{ color: "#94a3b8" }}>{project.company.name}</strong>
          </div>
          {project.clientContact && (
            <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
              Your contact: {project.clientContact.name}
              {project.clientContact.email ? ` · ${project.clientContact.email}` : ""}
              {project.clientContact.phone ? ` · ${project.clientContact.phone}` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Invoices ─────────────────────────────────────────── */}
          {invoices.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setInvoicesOpen(!invoicesOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Invoices</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>· {invoices.length}</span>
                </div>
                <span style={{ color: "#475569", fontSize: 14 }}>{invoicesOpen ? "▾" : "▸"}</span>
              </div>
              {invoicesOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {invoices.map((inv) => {
                      const badge = statusBadge(inv.status);
                      return (
                        <div
                          key={inv.id}
                          onClick={() => loadInvoiceDetail(inv.id)}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "14px 16px", borderRadius: 8, background: "rgba(15,23,42,0.5)",
                            border: "1px solid #1e293b", cursor: "pointer",
                            transition: "border-color 0.15s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#3b82f6"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1e293b"; }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
                              {inv.invoiceNo ?? "Invoice"}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                              Issued {formatDate(inv.issuedAt)}
                              {inv.dueAt ? ` · Due ${formatDate(inv.dueAt)}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{formatMoney(inv.totalAmount)}</div>
                              {inv.balanceDue > 0 && inv.balanceDue < inv.totalAmount && (
                                <div style={{ fontSize: 11, color: "#fde047" }}>
                                  {formatMoney(inv.balanceDue)} due
                                </div>
                              )}
                            </div>
                            <span style={{
                              padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                              textTransform: "uppercase", letterSpacing: "0.5px",
                              background: badge.bg, color: badge.color,
                            }}>
                              {badge.label}
                            </span>
                            <span style={{ color: "#475569" }}>→</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {invoiceLoading && (
                    <p style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginTop: 12 }}>
                      Loading invoice…
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Schedule ─────────────────────────────────────────── */}
          {schedule.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setScheduleOpen(!scheduleOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Schedule</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>· {schedule.length} tasks</span>
                </div>
                <span style={{ color: "#475569", fontSize: 14 }}>{scheduleOpen ? "▾" : "▸"}</span>
              </div>
              {scheduleOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {schedule.map((t) => (
                      <div key={t.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: 6, background: "rgba(15,23,42,0.5)",
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{t.name}</div>
                          {t.trade && <div style={{ fontSize: 11, color: "#64748b" }}>{t.trade}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", textAlign: "right" }}>
                          {t.startDate ? formatDate(t.startDate) : ""}
                          {t.endDate ? ` – ${formatDate(t.endDate)}` : ""}
                          {t.durationDays ? ` (${t.durationDays}d)` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Documents ────────────────────────────────────────── */}
          {files.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setDocsOpen(!docsOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Documents</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>· {files.length} files</span>
                </div>
                <span style={{ color: "#475569", fontSize: 14 }}>{docsOpen ? "▾" : "▸"}</span>
              </div>
              {docsOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {files.map((f) => (
                      <a
                        key={f.id}
                        href={f.storageUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px", borderRadius: 6, background: "rgba(15,23,42,0.5)",
                          textDecoration: "none", color: "inherit",
                          border: "1px solid transparent",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#334155"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{fileIcon(f.mimeType)}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>{f.fileName}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {formatDate(f.createdAt)}
                              {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                            </div>
                          </div>
                        </div>
                        <span style={{ color: "#3b82f6", fontSize: 12 }}>Download</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Messages ─────────────────────────────────────────── */}
          {messages.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setMessagesOpen(!messagesOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Messages</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>· {messages.length} threads</span>
                </div>
                <span style={{ color: "#475569", fontSize: 14 }}>{messagesOpen ? "▾" : "▸"}</span>
              </div>
              {messagesOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {messages.map((m) => (
                      <div key={m.id} style={{
                        padding: "10px 14px", borderRadius: 6, background: "rgba(15,23,42,0.5)",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                            {m.subject || "Message"}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{formatDate(m.updatedAt)}</div>
                        </div>
                        {m.lastMessage && (
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>
                            {m.lastMessage.body.length > 150 ? m.lastMessage.body.slice(0, 150) + "…" : m.lastMessage.body}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────── */}
          {invoices.length === 0 && schedule.length === 0 && files.length === 0 && messages.length === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 32px",
              background: "rgba(30,41,59,0.5)", borderRadius: 16, border: "1px solid #1e293b",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h2 style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
                Project details are being prepared
              </h2>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
                Your contractor will share invoices, documents, and schedule updates here.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #1e293b", padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#334155", margin: 0, textAlign: "center" }}>
          © {new Date().getFullYear()} Nexus Contractor Connect
        </p>
      </footer>
    </div>
  );
}
