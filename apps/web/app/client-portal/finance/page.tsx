"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────

interface FinanceSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
}

interface PortalInvoice {
  id: string;
  invoiceNo?: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  isOverdue: boolean;
  issuedAt?: string;
  dueAt?: string;
  memo?: string;
  billToName?: string;
  projectId: string;
  projectName: string;
  companyName: string;
}

interface RecentPayment {
  id: string;
  amount: number;
  method?: string;
  paidAt?: string;
  invoiceNo?: string;
  projectName: string;
}

interface FinanceData {
  summary: FinanceSummary;
  invoices: PortalInvoice[];
  recentPayments: RecentPayment[];
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

const invoiceStatusBadge = (status: string, isOverdue: boolean): { label: string; bg: string; color: string } => {
  if (isOverdue) return { label: "Overdue", bg: "rgba(239,68,68,0.15)", color: "#fca5a5" };
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ISSUED:         { label: "Issued",         bg: "rgba(59,130,246,0.15)",  color: "#93c5fd" },
    PARTIALLY_PAID: { label: "Partially Paid", bg: "rgba(234,179,8,0.15)",   color: "#fde047" },
    PAID:           { label: "Paid",           bg: "rgba(34,197,94,0.15)",   color: "#86efac" },
  };
  return map[status] ?? { label: status, bg: "rgba(100,116,139,0.15)", color: "#94a3b8" };
};

const paymentMethodLabel = (method?: string) => {
  if (!method) return "Payment";
  const map: Record<string, string> = {
    CHECK: "Check", ACH: "ACH", WIRE: "Wire", CREDIT_CARD: "Credit Card",
    CASH: "Cash", OTHER: "Other",
  };
  return map[method] ?? method;
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
};

const CARD_BODY: React.CSSProperties = {
  padding: "16px 20px",
};

type SortField = "issuedAt" | "dueAt" | "totalAmount" | "balanceDue" | "projectName";
type SortDir = "asc" | "desc";
type StatusFilter = "ALL" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

// ── Component ──────────────────────────────────────────────────────

export default function ClientPortalFinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // Filters & sort
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("issuedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";

  const handleSignOut = () => {
    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("companyId");
      localStorage.removeItem("userType");
    } catch { /* ignore */ }
    router.push("/welcome");
  };

  const fetchFinance = useCallback(async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const [finRes, meRes] = await Promise.all([
        fetch(`${API_BASE}/projects/portal/finance`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (finRes.status === 401 || finRes.status === 403) { router.push("/login"); return; }
      if (finRes.ok) {
        setData(await finRes.json());
      } else {
        setError(`Failed to load finance data (${finRes.status}).`);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setUserName([me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || null);
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchFinance(); }, [fetchFinance]);

  // Unique company names for filter dropdown
  const companyNames = useMemo(() => {
    if (!data) return [];
    const names = new Set(data.invoices.map((i) => i.companyName));
    return Array.from(names).sort();
  }, [data]);

  // Filtered & sorted invoices
  const filteredInvoices = useMemo(() => {
    if (!data) return [];
    let list = [...data.invoices];

    // Status filter
    if (statusFilter === "OVERDUE") {
      list = list.filter((i) => i.isOverdue);
    } else if (statusFilter !== "ALL") {
      list = list.filter((i) => i.status === statusFilter);
    }

    // Company filter
    if (companyFilter !== "ALL") {
      list = list.filter((i) => i.companyName === companyFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((i) =>
        (i.invoiceNo ?? "").toLowerCase().includes(q) ||
        i.projectName.toLowerCase().includes(q) ||
        (i.billToName ?? "").toLowerCase().includes(q) ||
        (i.memo ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "issuedAt" || sortField === "dueAt") {
        const da = a[sortField] ? new Date(a[sortField]!).getTime() : 0;
        const db = b[sortField] ? new Date(b[sortField]!).getTime() : 0;
        cmp = da - db;
      } else if (sortField === "totalAmount" || sortField === "balanceDue") {
        cmp = a[sortField] - b[sortField];
      } else if (sortField === "projectName") {
        cmp = a.projectName.localeCompare(b.projectName);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [data, statusFilter, companyFilter, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const summary = data?.summary;

  return (
    <div style={PAGE}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 32px", borderBottom: "1px solid #1e293b",
        maxWidth: 1200, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 32, width: "auto" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Client Portal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {userName && (
            <span style={{ fontSize: 13, color: "#64748b" }}>{userName}</span>
          )}
          <button onClick={handleSignOut} style={{
            padding: "7px 14px", borderRadius: 6,
            border: "1px solid #334155", background: "transparent",
            color: "#94a3b8", fontSize: 13, cursor: "pointer",
          }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab Nav */}
      <nav style={{
        maxWidth: 1200, margin: "0 auto", padding: "0 32px",
        borderBottom: "1px solid #1e293b",
        display: "flex", gap: 0,
      }}>
        <button
          onClick={() => router.push("/client-portal")}
          style={{
            padding: "12px 20px", fontSize: 13, fontWeight: 500,
            color: "#64748b", background: "transparent", border: "none",
            borderBottom: "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Projects
        </button>
        <button
          style={{
            padding: "12px 20px", fontSize: 13, fontWeight: 600,
            color: "#f1f5f9", background: "transparent", border: "none",
            borderBottom: "2px solid #3b82f6",
            cursor: "pointer",
          }}
        >
          Finance
        </button>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 48px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading financial summary…</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <p style={{ color: "#fca5a5", fontSize: 14, marginBottom: 16 }}>{error}</p>
            <button onClick={() => router.push("/login")} style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 14, cursor: "pointer",
            }}>Sign In Again</button>
          </div>
        ) : !data || data.invoices.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 32px",
            background: "rgba(30,41,59,0.5)", borderRadius: 16,
            border: "1px solid #1e293b",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
            <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>No invoices yet</h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
              When invoices are issued for your projects, they&apos;ll appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Page title */}
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px", color: "#f1f5f9" }}>Finance</h1>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                Financial overview across all your projects
              </p>
            </div>

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { label: "Total Invoiced", value: formatMoney(summary!.totalInvoiced), icon: "📄", accent: "#93c5fd" },
                { label: "Total Paid", value: formatMoney(summary!.totalPaid), icon: "✅", accent: "#86efac" },
                { label: "Outstanding", value: formatMoney(summary!.totalOutstanding), icon: "⏳", accent: summary!.totalOutstanding > 0 ? "#fde047" : "#86efac" },
                { label: "Overdue", value: String(summary!.overdueCount), icon: "⚠️", accent: summary!.overdueCount > 0 ? "#fca5a5" : "#86efac" },
              ].map((card) => (
                <div key={card.label} style={{
                  ...CARD,
                  padding: "20px 22px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {card.label}
                    </span>
                    <span style={{ fontSize: 20 }}>{card.icon}</span>
                  </div>
                  <span style={{ fontSize: 24, fontWeight: 700, color: card.accent }}>
                    {card.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Invoices Table */}
            <div style={CARD}>
              <div style={{ ...CARD_HEADER, flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                  Invoices
                  <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 8, fontSize: 12 }}>
                    {filteredInvoices.length} of {data.invoices.length}
                  </span>
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search invoices…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      padding: "6px 12px", borderRadius: 6,
                      border: "1px solid #334155", background: "rgba(15,23,42,0.6)",
                      color: "#e2e8f0", fontSize: 12, width: 160, outline: "none",
                    }}
                  />
                  {/* Status filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    style={{
                      padding: "6px 10px", borderRadius: 6,
                      border: "1px solid #334155", background: "rgba(15,23,42,0.6)",
                      color: "#e2e8f0", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ISSUED">Issued</option>
                    <option value="PARTIALLY_PAID">Partially Paid</option>
                    <option value="PAID">Paid</option>
                    <option value="OVERDUE">Overdue</option>
                  </select>
                  {/* Company filter */}
                  {companyNames.length > 1 && (
                    <select
                      value={companyFilter}
                      onChange={(e) => setCompanyFilter(e.target.value)}
                      style={{
                        padding: "6px 10px", borderRadius: 6,
                        border: "1px solid #334155", background: "rgba(15,23,42,0.6)",
                        color: "#e2e8f0", fontSize: 12, cursor: "pointer",
                      }}
                    >
                      <option value="ALL">All Contractors</option>
                      {companyNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b" }}>
                      {[
                        { field: "issuedAt" as SortField, label: "Date" },
                        { field: null, label: "Invoice #" },
                        { field: "projectName" as SortField, label: "Project" },
                        { field: null, label: "Status" },
                        { field: "totalAmount" as SortField, label: "Amount" },
                        { field: null, label: "Paid" },
                        { field: "balanceDue" as SortField, label: "Balance" },
                        { field: "dueAt" as SortField, label: "Due" },
                      ].map((col) => (
                        <th
                          key={col.label}
                          onClick={() => col.field && handleSort(col.field)}
                          style={{
                            padding: "10px 14px",
                            textAlign: col.label === "Amount" || col.label === "Paid" || col.label === "Balance" ? "right" : "left",
                            color: "#64748b", fontWeight: 500, fontSize: 11,
                            textTransform: "uppercase", letterSpacing: "0.5px",
                            cursor: col.field ? "pointer" : "default",
                            whiteSpace: "nowrap",
                            userSelect: "none",
                          }}
                        >
                          {col.label}{col.field ? sortIndicator(col.field) : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13 }}>
                          No invoices match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((inv) => {
                        const badge = invoiceStatusBadge(inv.status, inv.isOverdue);
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => router.push(`/client-portal/projects/${inv.projectId}`)}
                            style={{
                              borderBottom: "1px solid rgba(30,41,59,0.5)",
                              cursor: "pointer",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.05)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ padding: "10px 14px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                              {formatDate(inv.issuedAt)}
                            </td>
                            <td style={{ padding: "10px 14px", color: "#e2e8f0", fontWeight: 500 }}>
                              {inv.invoiceNo ?? "—"}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ color: "#e2e8f0", fontSize: 13 }}>{inv.projectName}</div>
                              {companyNames.length > 1 && (
                                <div style={{ color: "#475569", fontSize: 11, marginTop: 1 }}>{inv.companyName}</div>
                              )}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{
                                padding: "3px 10px", borderRadius: 20,
                                fontSize: 11, fontWeight: 600,
                                background: badge.bg, color: badge.color,
                                textTransform: "uppercase", letterSpacing: "0.5px",
                                whiteSpace: "nowrap",
                              }}>
                                {badge.label}
                              </span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>
                              {formatMoney(inv.totalAmount)}
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: "#86efac", fontVariantNumeric: "tabular-nums" }}>
                              {inv.paidAmount > 0 ? formatMoney(inv.paidAmount) : "—"}
                            </td>
                            <td style={{
                              padding: "10px 14px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                              color: inv.balanceDue > 0 ? (inv.isOverdue ? "#fca5a5" : "#fde047") : "#86efac",
                            }}>
                              {formatMoney(inv.balanceDue)}
                            </td>
                            <td style={{
                              padding: "10px 14px", whiteSpace: "nowrap",
                              color: inv.isOverdue ? "#fca5a5" : "#94a3b8",
                              fontWeight: inv.isOverdue ? 600 : 400,
                            }}>
                              {formatDate(inv.dueAt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Payments */}
            {data.recentPayments.length > 0 && (
              <div style={CARD}>
                <div style={CARD_HEADER}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Recent Payments</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{data.recentPayments.length} most recent</span>
                </div>
                <div style={CARD_BODY}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {data.recentPayments.map((pay) => (
                      <div key={pay.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 0",
                        borderBottom: "1px solid rgba(30,41,59,0.5)",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: "#86efac", flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 13, color: "#e2e8f0" }}>
                              {paymentMethodLabel(pay.method)}
                              {pay.invoiceNo && (
                                <span style={{ color: "#64748b" }}> — Inv #{pay.invoiceNo}</span>
                              )}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: "#475569", paddingLeft: 14 }}>
                            {pay.projectName} • {formatDate(pay.paidAt)}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 14, fontWeight: 600, color: "#86efac",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {formatMoney(pay.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #1e293b", padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#334155", margin: 0, textAlign: "center" }}>
          © {new Date().getFullYear()} Nexus Contractor Connect
          <span style={{ margin: "0 12px" }}>•</span>
          <a href="/welcome#privacy" style={{ color: "#475569", textDecoration: "none" }}>Privacy Policy</a>
        </p>
      </footer>
    </div>
  );
}
