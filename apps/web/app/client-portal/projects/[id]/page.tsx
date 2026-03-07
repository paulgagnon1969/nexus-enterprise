"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { usePlaidLink } from "react-plaid-link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

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
  dailyLogs?: DailyLog[];
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
  createdAt: string;
}

interface DailyLogAttachment {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  fileId: string;
}

interface DailyLog {
  id: string;
  logDate: string;
  title?: string;
  body?: string;
  type: string;
  status?: string;
  weather?: string;
  createdAt: string;
  createdBy?: string;
  attachments: DailyLogAttachment[];
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
  fileId?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  paidAt?: string;
}

/** Unified file entry used across all document groups. */
interface DocGroupFile {
  key: string;        // unique React key
  fileId: string;     // projectFileId — used for download / preview
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  context?: string;   // e.g. "Daily Log: Mar 5 — Drywall Install"
}

type DocGroupId = "daily-logs" | "photos" | "docs-plans";

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
    ISSUED: { label: "Issued", bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    PARTIALLY_PAID: { label: "Partially Paid", bg: "rgba(234,179,8,0.15)", color: "#ca8a04" },
    PAID: { label: "Paid", bg: "rgba(34,197,94,0.15)", color: "#16a34a" },
  };
  return map[status] ?? { label: status, bg: "rgba(100,116,139,0.15)", color: "#6b7280" };
};

const projectStatusBadge = (status: string): { bg: string; color: string } => {
  const s = status.toUpperCase();
  const map: Record<string, { bg: string; color: string }> = {
    ACTIVE: { bg: "rgba(34,197,94,0.15)", color: "#16a34a" },
    OPEN: { bg: "rgba(34,197,94,0.15)", color: "#16a34a" },
    COMPLETE: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    COMPLETED: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    ON_HOLD: { bg: "rgba(234,179,8,0.15)", color: "#ca8a04" },
    CLOSED: { bg: "rgba(100,116,139,0.15)", color: "#6b7280" },
    WARRANTY: { bg: "rgba(168,85,247,0.15)", color: "#7c3aed" },
  };
  return map[s] ?? { bg: "rgba(100,116,139,0.15)", color: "#6b7280" };
};

const fileIcon = (mimeType?: string): string => {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "📦";
  return "📄";
};

const downloadPortalFile = async (projectId: string, fileId: string, fileName: string) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/projects/portal/${projectId}/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // silent
  }
};

// ── Styles ─────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const CARD: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflow: "hidden",
};

const CARD_HEADER: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid #e5e7eb",
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
  borderBottom: "1px solid #e5e7eb",
  display: "flex", gap: 0,
};

const TAB_INACTIVE: React.CSSProperties = {
  padding: "12px 20px", fontSize: 13, fontWeight: 500,
  color: "#6b7280", background: "transparent", border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
};

// ── Payment Sub-components ─────────────────────────────────────────

function CardPaymentForm({
  invoiceId,
  projectId,
  amount,
  onSuccess,
}: {
  invoiceId: string;
  projectId: string;
  amount: string;
  onSuccess: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";
    fetch(`${API_BASE}/projects/portal/${projectId}/invoices/${invoiceId}/pay`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((d) => setClientSecret(d.clientSecret))
      .catch(() => setError("Failed to initialize payment"));
  }, [invoiceId, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setLoading(true);
    setError(null);
    const card = elements.getElement(CardElement);
    if (!card) { setLoading(false); return; }
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (stripeError) {
      setError(stripeError.message || "Payment failed");
      setLoading(false);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess("Payment successful! Your invoice will be updated shortly.");
    } else {
      onSuccess("Payment is being processed. Your invoice will be updated once confirmed.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ padding: "12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", marginBottom: 16 }}>
        <CardElement options={{ style: { base: { fontSize: "16px", color: "#0f172a" } } }} />
      </div>
      {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="submit"
        disabled={!stripe || !clientSecret || loading}
        style={{
          width: "100%", padding: "12px", borderRadius: 8, border: "none",
          background: loading ? "#9ca3af" : "#16a34a", color: "#fff",
          fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Processing\u2026" : `Pay ${amount}`}
      </button>
    </form>
  );
}

function PlaidPaymentButton({
  invoiceId,
  projectId,
  amount,
  onSuccess,
}: {
  invoiceId: string;
  projectId: string;
  amount: string;
  onSuccess: (msg: string) => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";
    fetch(`${API_BASE}/projects/portal/${projectId}/invoices/${invoiceId}/pay/plaid-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.linkToken))
      .catch(() => setError("Failed to initialize bank connection"));
  }, [invoiceId, projectId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      setLoading(true);
      setStatus("Connecting your bank account\u2026");
      const authToken = typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";
      try {
        const res = await fetch(
          `${API_BASE}/projects/portal/${projectId}/invoices/${invoiceId}/pay/plaid-exchange`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ publicToken, accountId: metadata.accounts[0]?.id }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Payment failed");
        onSuccess(data.message || "ACH payment initiated successfully!");
      } catch (err: any) {
        setError(err.message || "Payment failed");
        setLoading(false);
      }
    },
    onExit: () => { /* User closed Plaid Link */ },
  });

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, margin: 0, marginTop: 0 }}>
        Connect your bank account to pay via ACH transfer. Funds typically settle in 1\u20133 business days.
      </p>
      {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12, marginTop: 8 }}>{error}</div>}
      {status && <p style={{ fontSize: 13, color: "#2563eb", marginBottom: 12, marginTop: 8 }}>{status}</p>}
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken || loading}
        style={{
          width: "100%", padding: "12px", borderRadius: 8, border: "none", marginTop: 16,
          background: (!ready || !linkToken || loading) ? "#9ca3af" : "#2563eb", color: "#fff",
          fontSize: 15, fontWeight: 600, cursor: (!ready || !linkToken || loading) ? "default" : "pointer",
        }}
      >
        {loading ? "Processing\u2026" : `Pay ${amount} via Bank Transfer`}
      </button>
    </div>
  );
}

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
  const [dailyLogsOpen, setDailyLogsOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

  // Invoice detail
  const [activeInvoice, setActiveInvoice] = useState<InvoiceDetail | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTab, setPayTab] = useState<"card" | "ach">("card");
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Document selection & preview
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<{ fileId: string; fileName: string; mimeType?: string; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeDocGroup, setActiveDocGroup] = useState<DocGroupId | null>(null);

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

  // ── Document helpers ──────────────────────────────────────────────

  const toggleFileSelection = (key: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllGroupFiles = (groupFiles: DocGroupFile[]) => {
    const keys = groupFiles.map((f) => f.key);
    setSelectedFiles((prev) => {
      const allSelected = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const downloadSelectedGroupFiles = (groupFiles: DocGroupFile[]) => {
    groupFiles
      .filter((f) => selectedFiles.has(f.key))
      .forEach((f) => downloadPortalFile(projectId, f.fileId, f.fileName));
  };

  const openDocPreview = async (file: DocGroupFile) => {
    const token = getToken();
    if (!token) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/projects/portal/${projectId}/files/${file.fileId}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewFile({ fileId: file.fileId, fileName: file.fileName, mimeType: file.mimeType, url });
    } catch {
      // silent
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.url);
      setPreviewFile(null);
    }
  };

  const toggleDocGroup = (group: DocGroupId) => {
    setActiveDocGroup((prev) => (prev === group ? null : group));
    setSelectedFiles(new Set()); // reset selection when switching groups
  };

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
          <p style={{ color: "#6b7280", fontSize: 14 }}>Loading project…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
          <p style={{ color: "#dc2626", fontSize: 14, marginBottom: 16 }}>{error || "Project not found."}</p>
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
  const dailyLogs = project.dailyLogs ?? [];
  const pStatus = projectStatusBadge(project.status);

  // ── Document groups ─────────────────────────────────────────────
  const dailyLogFiles: DocGroupFile[] = dailyLogs.flatMap((log) =>
    log.attachments.map((a) => ({
      key: `dl-${a.id}`,
      fileId: a.fileId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: log.logDate || log.createdAt,
      context: `${log.title || "Daily Log"} — ${formatDate(log.logDate)}`,
    })),
  );

  const photoFiles: DocGroupFile[] = files
    .filter((f) => f.mimeType?.startsWith("image/"))
    .map((f) => ({
      key: `pf-${f.id}`,
      fileId: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
    }));

  const docPlanFiles: DocGroupFile[] = files
    .filter((f) => !f.mimeType?.startsWith("image/"))
    .map((f) => ({
      key: `dp-${f.id}`,
      fileId: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
    }));

  const totalDocCount = dailyLogFiles.length + photoFiles.length + docPlanFiles.length;

  const docGroups: { id: DocGroupId; label: string; icon: string; accent: string; files: DocGroupFile[] }[] = [
    { id: "daily-logs", label: "Daily Logs", icon: "📋", accent: "#2563eb", files: dailyLogFiles },
    { id: "photos", label: "Photos", icon: "🖼️", accent: "#16a34a", files: photoFiles },
    { id: "docs-plans", label: "Documents & Plans", icon: "📄", accent: "#7c3aed", files: docPlanFiles },
  ];

  const activeGroupFiles = activeDocGroup ? docGroups.find((g) => g.id === activeDocGroup)?.files ?? [] : [];

  // ── Invoice Detail View ──────────────────────────────────────────

  if (activeInvoice) {
    return (
      <div style={PAGE}>
        <style>{`
          @media print {
            body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-invoice { background: #fff !important; box-shadow: none !important; border: none !important; }
            .print-banner { background: #dbeafe !important; border-color: #93c5fd !important; }
            .print-banner-paid { background: rgba(34,197,94,0.1) !important; border-color: #22c55e !important; }
            .print-invoice table { border-collapse: collapse; }
            .print-invoice th, .print-invoice td { border-bottom: 1px solid #374151 !important; color: #111827 !important; }
          }
        `}</style>

        <div className="no-print" style={{ maxWidth: 900, margin: "0 auto", padding: "18px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setActiveInvoice(null)}
              style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                background: "transparent", color: "#6b7280", fontSize: 13, cursor: "pointer",
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
                <div
                  className={activeInvoice.status === "PAID" ? "print-banner-paid" : "print-banner"}
                  style={{
                    padding: "12px 16px", borderRadius: 8, marginBottom: 24,
                    background: bannerBg, border: `1px solid ${bannerBorder}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
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
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                  {activeInvoice.company.name}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {activeInvoice.project.addressLine1}, {activeInvoice.project.city}, {activeInvoice.project.state} {activeInvoice.project.postalCode ?? ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {activeInvoice.invoiceNo ?? "Invoice"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Issued: {formatDate(activeInvoice.issuedAt)}
                </div>
                {activeInvoice.dueAt && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Due: {formatDate(activeInvoice.dueAt)}
                  </div>
                )}
              </div>
            </div>

            {/* Bill To */}
            {activeInvoice.billToName && (
              <div style={{ marginBottom: 24, padding: "12px 16px", background: "#f1f5f9", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Bill To</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{activeInvoice.billToName}</div>
                {activeInvoice.billToAddress && (
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {activeInvoice.billToAddress}
                    {activeInvoice.billToCity && `, ${activeInvoice.billToCity}`}
                    {activeInvoice.billToState && `, ${activeInvoice.billToState}`}
                    {activeInvoice.billToZip && ` ${activeInvoice.billToZip}`}
                  </div>
                )}
                {activeInvoice.billToEmail && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{activeInvoice.billToEmail}</div>
                )}
                {activeInvoice.billToPhone && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{activeInvoice.billToPhone}</div>
                )}
              </div>
            )}

            {/* Project reference */}
            <div style={{ marginBottom: 24, padding: "12px 16px", background: "#f1f5f9", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Project</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{activeInvoice.project.name}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {activeInvoice.project.addressLine1}, {activeInvoice.project.city}, {activeInvoice.project.state}
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>#</th>
                    <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Unit Price</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvoice.lineItems.map((li, idx) => (
                    <tr key={li.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "10px 8px", color: "#6b7280" }}>{idx + 1}</td>
                      <td style={{ padding: "10px 8px", color: "#374151" }}>{li.description}</td>
                      <td style={{ padding: "10px 8px", color: "#4b5563", textAlign: "right" }}>
                        {li.qty != null ? `${li.qty}${li.unitCode ? ` ${li.unitCode}` : ""}` : ""}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#4b5563", textAlign: "right" }}>
                        {li.unitPrice != null ? formatMoney(li.unitPrice) : ""}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 600, textAlign: "right" }}>
                        {formatMoney(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ marginTop: 20, borderTop: "2px solid #d1d5db", paddingTop: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
                  <span style={{ color: "#6b7280" }}>Total</span>
                  <span style={{ color: "#0f172a", fontWeight: 700, minWidth: 100, textAlign: "right" }}>{formatMoney(activeInvoice.totalAmount)}</span>
                </div>
                {activeInvoice.paidAmount > 0 && (
                  <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
                    <span style={{ color: "#16a34a" }}>Paid</span>
                    <span style={{ color: "#16a34a", fontWeight: 600, minWidth: 100, textAlign: "right" }}>−{formatMoney(activeInvoice.paidAmount)}</span>
                  </div>
                )}
                {activeInvoice.balanceDue > 0 && (
                  <div style={{ display: "flex", gap: 24, fontSize: 16, marginTop: 4 }}>
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>Balance Due</span>
                    <span style={{ color: "#0f172a", fontWeight: 700, minWidth: 100, textAlign: "right" }}>{formatMoney(activeInvoice.balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pay Now */}
            {activeInvoice.balanceDue > 0 && activeInvoice.status !== "PAID" && activeInvoice.status !== "VOID" && activeInvoice.status !== "DRAFT" && !paymentSuccess && (
              <div className="no-print" style={{ marginTop: 24, textAlign: "center" }}>
                <button
                  onClick={() => { setShowPayModal(true); setPayTab("card"); setPaymentSuccess(null); }}
                  style={{
                    padding: "14px 48px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
                  }}
                >
                  Pay Now — {formatMoney(activeInvoice.balanceDue)}
                </button>
              </div>
            )}

            {/* Payment success message */}
            {paymentSuccess && (
              <div style={{
                marginTop: 24, padding: "16px 20px", borderRadius: 10,
                background: "rgba(34,197,94,0.1)", border: "1px solid #22c55e",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#15803d", marginBottom: 4 }}>{paymentSuccess}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>You can close this page or check back later for an updated invoice.</div>
              </div>
            )}

            {/* Memo */}
            {activeInvoice.memo && (
              <div style={{ marginTop: 20, padding: "12px 16px", background: "#f1f5f9", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>
                <strong style={{ color: "#4b5563" }}>Memo:</strong> {activeInvoice.memo}
              </div>
            )}

            {/* Attachments */}
            {activeInvoice.attachments.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Supporting Documents</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {activeInvoice.attachments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => a.fileId && downloadPortalFile(projectId, a.fileId, a.fileName)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 6, background: "rgba(59,130,246,0.1)",
                        border: "1px solid rgba(59,130,246,0.2)", color: "#2563eb",
                        fontSize: 12, cursor: "pointer",
                      }}
                    >
                      {fileIcon(a.mimeType)} {a.fileName}
                      {a.sizeBytes ? ` (${formatBytes(a.sizeBytes)})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Payment History */}
            {activeInvoice.payments.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment History</div>
                {activeInvoice.payments.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>
                      {formatDate(p.paidAt)} · {p.method.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment Modal */}
        {showPayModal && activeInvoice.balanceDue > 0 && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setShowPayModal(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid #e5e7eb",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Pay Invoice</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {activeInvoice.invoiceNo ?? "Invoice"} — {formatMoney(activeInvoice.balanceDue)}
                </div>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                style={{ background: "none", border: "none", fontSize: 22, color: "#9ca3af", cursor: "pointer", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Payment method tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
              <button
                onClick={() => setPayTab("card")}
                style={{
                  flex: 1, padding: "12px", border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 600, background: "transparent",
                  color: payTab === "card" ? "#16a34a" : "#6b7280",
                  borderBottom: payTab === "card" ? "2px solid #16a34a" : "2px solid transparent",
                }}
              >
                💳 Credit / Debit Card
              </button>
              <button
                onClick={() => setPayTab("ach")}
                style={{
                  flex: 1, padding: "12px", border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 600, background: "transparent",
                  color: payTab === "ach" ? "#2563eb" : "#6b7280",
                  borderBottom: payTab === "ach" ? "2px solid #2563eb" : "2px solid transparent",
                }}
              >
                🏦 Bank Transfer (ACH)
              </button>
            </div>

            {/* Payment form */}
            <div style={{ padding: 24 }}>
              {payTab === "card" && stripePromise && (
                <Elements stripe={stripePromise}>
                  <CardPaymentForm
                    invoiceId={activeInvoice.id}
                    projectId={projectId}
                    amount={formatMoney(activeInvoice.balanceDue)}
                    onSuccess={(msg) => {
                      setShowPayModal(false);
                      setPaymentSuccess(msg);
                    }}
                  />
                </Elements>
              )}
              {payTab === "card" && !stripePromise && (
                <div style={{ color: "#dc2626", fontSize: 13 }}>Card payments are not configured. Please contact support.</div>
              )}
              {payTab === "ach" && (
                <PlaidPaymentButton
                  invoiceId={activeInvoice.id}
                  projectId={projectId}
                  amount={formatMoney(activeInvoice.balanceDue)}
                  onSuccess={(msg) => {
                    setShowPayModal(false);
                    setPaymentSuccess(msg);
                  }}
                />
              )}
            </div>

            {/* Security note */}
            <div style={{
              padding: "12px 24px 20px", borderTop: "1px solid #f1f5f9",
              fontSize: 11, color: "#9ca3af", textAlign: "center",
            }}>
              🔒 Payments are processed securely by Stripe. Your card details are never stored on our servers.
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }

  // ── Main Project View ────────────────────────────────────────

  return (
    <div style={PAGE}>
      {/* Header */}
      <header style={{
        maxWidth: 900, margin: "0 auto", padding: "18px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 28, width: "auto" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Project Portal</span>
        </div>
        <button
          onClick={() => router.push("/client-portal")}
          style={{
            padding: "7px 14px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "transparent", color: "#6b7280", fontSize: 13, cursor: "pointer",
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
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>{project.name}</h1>
            <span style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.5px",
              background: pStatus.bg, color: pStatus.color,
            }}>
              {project.status}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            {project.addressLine1}
            {project.addressLine2 ? `, ${project.addressLine2}` : ""}
            , {project.city}, {project.state} {project.postalCode ?? ""}
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
            Contractor: <strong style={{ color: "#6b7280" }}>{project.company.name}</strong>
          </div>
          {project.clientContact && (
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
              Your contact: {project.clientContact.name}
              {project.clientContact.email ? ` · ${project.clientContact.email}` : ""}
              {project.clientContact.phone ? ` · ${project.clientContact.phone}` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Daily Logs ────────────────────────────────────────── */}
          {dailyLogs.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setDailyLogsOpen(!dailyLogsOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Daily Logs</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>· {dailyLogs.length}</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>{dailyLogsOpen ? "▾" : "▸"}</span>
              </div>
              {dailyLogsOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {dailyLogs.map((log) => (
                      <div key={log.id} style={{
                        padding: "14px 16px", borderRadius: 8, background: "#f1f5f9",
                        border: "1px solid #e5e7eb",
                      }}>
                        {/* Log header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: log.body ? 8 : 0 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                              {log.title || "Daily Log"}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              {formatDate(log.logDate)}
                              {log.createdBy ? ` · ${log.createdBy}` : ""}
                            </div>
                          </div>
                          {log.weather && (
                            <span style={{
                              padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                              background: "rgba(59,130,246,0.08)", color: "#2563eb",
                            }}>
                              {log.weather}
                            </span>
                          )}
                        </div>
                        {/* Work performed */}
                        {log.body && (
                          <div style={{
                            fontSize: 13, color: "#374151", lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                          }}>
                            {log.body}
                          </div>
                        )}
                        {/* Attachments */}
                        {log.attachments.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {log.attachments.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => downloadPortalFile(projectId, a.fileId, a.fileName)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "4px 10px", borderRadius: 6, background: "rgba(59,130,246,0.08)",
                                  border: "1px solid rgba(59,130,246,0.15)", color: "#2563eb",
                                  fontSize: 11, cursor: "pointer",
                                }}
                              >
                                {fileIcon(a.mimeType)} {a.fileName}
                                {a.sizeBytes ? ` (${formatBytes(a.sizeBytes)})` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Invoices ─────────────────────────────────────────── */}
          {invoices.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setInvoicesOpen(!invoicesOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Invoices</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>· {invoices.length}</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>{invoicesOpen ? "▾" : "▸"}</span>
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
                            padding: "14px 16px", borderRadius: 8, background: "#f1f5f9",
                            border: "1px solid #e5e7eb", cursor: "pointer",
                            transition: "border-color 0.15s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#2563eb"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                              {inv.invoiceNo ?? "Invoice"}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              Issued {formatDate(inv.issuedAt)}
                              {inv.dueAt ? ` · Due ${formatDate(inv.dueAt)}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{formatMoney(inv.totalAmount)}</div>
                              {inv.balanceDue > 0 && inv.balanceDue < inv.totalAmount && (
                                <div style={{ fontSize: 11, color: "#ca8a04" }}>
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
                            <span style={{ color: "#9ca3af" }}>→</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {invoiceLoading && (
                    <p style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 12 }}>
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
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Schedule</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>· {schedule.length} tasks</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>{scheduleOpen ? "▾" : "▸"}</span>
              </div>
              {scheduleOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {schedule.map((t) => (
                      <div key={t.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", borderRadius: 6, background: "#f1f5f9",
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{t.name}</div>
                          {t.trade && <div style={{ fontSize: 11, color: "#6b7280" }}>{t.trade}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>
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

          {/* ── Documents (grouped tiles) ─────────────────────────── */}
          {totalDocCount > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setDocsOpen(!docsOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Documents</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>· {totalDocCount} files</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>{docsOpen ? "▾" : "▸"}</span>
              </div>
              {docsOpen && (
                <div style={CARD_BODY}>
                  {/* ── Group Tiles ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: activeDocGroup ? 16 : 0 }}>
                    {docGroups.map((g) => {
                      const isActive = activeDocGroup === g.id;
                      const isEmpty = g.files.length === 0;
                      return (
                        <button
                          key={g.id}
                          onClick={() => !isEmpty && toggleDocGroup(g.id)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            gap: 6, padding: "20px 12px", borderRadius: 10,
                            border: isActive ? `2px solid ${g.accent}` : "1px solid #e5e7eb",
                            background: isActive ? `${g.accent}0D` : isEmpty ? "#f9fafb" : "#fff",
                            cursor: isEmpty ? "default" : "pointer",
                            opacity: isEmpty ? 0.45 : 1,
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ fontSize: 28 }}>{g.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? g.accent : "#374151" }}>
                            {g.label}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: isActive ? g.accent : "#6b7280",
                            background: isActive ? `${g.accent}1A` : "#f1f5f9",
                            padding: "2px 10px", borderRadius: 10,
                          }}>
                            {g.files.length} file{g.files.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Expanded file list for active group ── */}
                  {activeDocGroup && activeGroupFiles.length > 0 && (
                    <>
                      {/* Toolbar */}
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10, padding: "0 2px",
                      }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                          <input
                            type="checkbox"
                            checked={activeGroupFiles.length > 0 && activeGroupFiles.every((f) => selectedFiles.has(f.key))}
                            onChange={() => toggleSelectAllGroupFiles(activeGroupFiles)}
                            style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#3b82f6" }}
                          />
                          Select all
                        </label>
                        {selectedFiles.size > 0 && (
                          <button
                            onClick={() => downloadSelectedGroupFiles(activeGroupFiles)}
                            style={{
                              padding: "6px 14px", borderRadius: 6, border: "none",
                              background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Download {activeGroupFiles.filter((f) => selectedFiles.has(f.key)).length} file{activeGroupFiles.filter((f) => selectedFiles.has(f.key)).length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>

                      {/* File rows */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {activeGroupFiles.map((f) => (
                          <div
                            key={f.key}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px", borderRadius: 6, background: "#f1f5f9",
                              border: selectedFiles.has(f.key) ? "1px solid #3b82f6" : "1px solid transparent",
                              transition: "border-color 0.15s",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(f.key)}
                              onChange={() => toggleFileSelection(f.key)}
                              style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0, accentColor: "#3b82f6" }}
                            />
                            <div
                              onClick={() => openDocPreview(f)}
                              style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}
                            >
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(f.mimeType)}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13, fontWeight: 500, color: "#374151",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {f.fileName}
                                </div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>
                                  {f.context ? `${f.context} · ` : ""}
                                  {formatDate(f.createdAt)}
                                  {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadPortalFile(projectId, f.fileId, f.fileName); }}
                              style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 12, cursor: "pointer", flexShrink: 0, padding: "4px 0" }}
                            >
                              Download
                            </button>
                          </div>
                        ))}
                      </div>

                      {previewLoading && (
                        <p style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 12 }}>
                          Loading preview…
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Messages ─────────────────────────────────────────── */}
          {messages.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER} onClick={() => setMessagesOpen(!messagesOpen)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Messages</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>· {messages.length} threads</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>{messagesOpen ? "▾" : "▸"}</span>
              </div>
              {messagesOpen && (
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {messages.map((m) => (
                      <div key={m.id} style={{
                        padding: "10px 14px", borderRadius: 6, background: "#f1f5f9",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                            {m.subject || "Message"}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>{formatDate(m.updatedAt)}</div>
                        </div>
                        {m.lastMessage && (
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.4 }}>
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
          {invoices.length === 0 && schedule.length === 0 && files.length === 0 && messages.length === 0 && dailyLogs.length === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 32px",
              background: "#f8fafc", borderRadius: 16, border: "1px solid #e5e7eb",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h2 style={{ color: "#0f172a", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
                Project details are being prepared
              </h2>
              <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
                Your contractor will share invoices, documents, and schedule updates here.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0, textAlign: "center" }}>
          © {new Date().getFullYear()} Nexus Contractor Connect
        </p>
      </footer>

      {/* ── Document Preview Modal ───────────────────────────────── */}
      {previewFile && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 900,
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
            }}
          >
            {/* Modal header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 20px", borderBottom: "1px solid #e5e7eb", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>{fileIcon(previewFile.mimeType)}</span>
                <span style={{
                  fontSize: 14, fontWeight: 600, color: "#0f172a",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {previewFile.fileName}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => downloadPortalFile(projectId, previewFile.fileId, previewFile.fileName)}
                  style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                    background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Download
                </button>
                <button
                  onClick={closePreview}
                  style={{
                    width: 32, height: 32, borderRadius: 6, border: "none",
                    background: "#f1f5f9", color: "#6b7280", fontSize: 18,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, minHeight: 200 }}>
              {previewFile.mimeType?.startsWith("image/") ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.fileName}
                  style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 4 }}
                />
              ) : previewFile.mimeType === "application/pdf" ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.fileName}
                  style={{ width: "100%", height: "75vh", border: "none", borderRadius: 4 }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>{fileIcon(previewFile.mimeType)}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
                    {previewFile.fileName}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
                    Preview is not available for this file type.
                  </div>
                  <button
                    onClick={() => downloadPortalFile(projectId, previewFile.fileId, previewFile.fileName)}
                    style={{
                      padding: "10px 24px", borderRadius: 8, border: "none",
                      background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
