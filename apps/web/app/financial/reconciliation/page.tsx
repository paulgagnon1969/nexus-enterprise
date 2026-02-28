"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────

type ProjectSummary = {
  projectId: string;
  projectName: string;
  status: string;
  totalAmount: number;
  transactionCount: number;
};

type ProjectsSummaryResponse = {
  projects: ProjectSummary[];
  unassignedCount: number;
  totalProjects: number;
};

type BankSummary = {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  transactionCount: number;
  byCategory: Record<string, { inflow: number; outflow: number; count: number }>;
};

type UnifiedTransaction = {
  id: string;
  source: string;
  date: string;
  description: string;
  amount: number;
  merchant: string | null;
  category: string | null;
  pending: boolean;
  projectId: string | null;
  projectName: string | null;
  extra: Record<string, any>;
};

type ProjectPickerItem = { id: string; name: string };

// ── Page ─────────────────────────────────────────────────────────────

export default function FinancialReconciliationPage() {
  const [projectsSummary, setProjectsSummary] = useState<ProjectsSummaryResponse | null>(null);
  const [bankSummary, setBankSummary] = useState<BankSummary | null>(null);
  const [unassigned, setUnassigned] = useState<UnifiedTransaction[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [projects, setProjects] = useState<ProjectPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Source breakdown (computed from unassigned + summary)
  type SourceBreakdown = { source: string; count: number; total: number };
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown[]>([]);

  function getToken() {
    return typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
  }

  async function fetchAll() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString() ? `?${params}` : "";

      const [projRes, summRes, unassRes, projListRes] = await Promise.all([
        fetch(`${API_BASE}/banking/projects-summary${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/banking/transactions/summary${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/banking/transactions/unified?unassigned=true&pageSize=20&sortBy=date&sortDir=desc${qs ? "&" + params : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (projRes.ok) setProjectsSummary(await projRes.json());
      if (summRes.ok) setBankSummary(await summRes.json());
      if (unassRes.ok) {
        const json = await unassRes.json();
        setUnassigned(json.transactions ?? []);
        setUnassignedTotal(json.total ?? 0);
        setUnassignedPage(1);
      }
      if (projListRes.ok) {
        const data = await projListRes.json();
        const items = (Array.isArray(data) ? data : data.projects ?? []).map((p: any) => ({ id: p.id, name: p.name }));
        setProjects(items);
      }

      // Fetch source breakdown (all transactions, grouped by source via separate calls)
      const sources = ["PLAID", "HD_PRO_XTRA", "CHASE_BANK", "APPLE_CARD"];
      const breakdowns: SourceBreakdown[] = [];
      for (const src of sources) {
        const srcParams = new URLSearchParams(params);
        srcParams.set("source", src);
        srcParams.set("pageSize", "1");
        const srcRes = await fetch(`${API_BASE}/banking/transactions/unified?${srcParams}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (srcRes.ok) {
          const srcJson = await srcRes.json();
          if (srcJson.total > 0) {
            breakdowns.push({ source: src, count: srcJson.total, total: 0 });
          }
        }
      }
      setSourceBreakdown(breakdowns);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load reconciliation data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchUnassignedPage(page: number) {
    const token = getToken();
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set("unassigned", "true");
      params.set("pageSize", "20");
      params.set("page", String(page));
      params.set("sortBy", "date");
      params.set("sortDir", "desc");
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`${API_BASE}/banking/transactions/unified?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setUnassigned(json.transactions ?? []);
        setUnassignedTotal(json.total ?? 0);
        setUnassignedPage(json.page ?? page);
      }
    } catch {}
  }

  async function handleAssign(txnId: string, source: string, projectId: string) {
    const token = getToken();
    if (!token || !projectId) return;
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${txnId}/assign-project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, source }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      // Remove from unassigned list optimistically
      setUnassigned(prev => prev.filter(t => t.id !== txnId));
      setUnassignedTotal(prev => Math.max(0, prev - 1));
      // Refresh project summary
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const projRes = await fetch(`${API_BASE}/banking/projects-summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (projRes.ok) setProjectsSummary(await projRes.json());
    } catch (err: any) {
      setError(err?.message ?? "Failed to assign project");
    }
  }

  function exportCsv() {
    if (!projectsSummary) return;
    const rows = [
      ["Project", "Status", "Transactions", "Total Amount"],
      ...projectsSummary.projects.map(p => [
        p.projectName,
        p.status,
        String(p.transactionCount),
        p.totalAmount.toFixed(2),
      ]),
      [],
      ["Unassigned", "", String(projectsSummary.unassignedCount), ""],
    ];
    const csv = rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (v: number) =>
    Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sourceLabels: Record<string, string> = {
    PLAID: "Plaid (Bank)",
    HD_PRO_XTRA: "Home Depot",
    CHASE_BANK: "Chase CSV",
    APPLE_CARD: "Apple Card",
  };

  const srcBadge: Record<string, { label: string; bg: string; color: string }> = {
    PLAID: { label: "Bank", bg: "#dbeafe", color: "#1d4ed8" },
    HD_PRO_XTRA: { label: "HD", bg: "#ffedd5", color: "#c2410c" },
    CHASE_BANK: { label: "Chase", bg: "#dbeafe", color: "#2563eb" },
    APPLE_CARD: { label: "Apple", bg: "#f3f4f6", color: "#374151" },
  };

  const reconciledCount = projectsSummary
    ? projectsSummary.projects.reduce((s, p) => s + p.transactionCount, 0)
    : 0;
  const totalTxns = bankSummary?.transactionCount ?? 0;

  return (
    <PageCard>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Link
          href="/financial"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 6, border: "1px solid #e5e7eb",
            background: "#f9fafb", textDecoration: "none", fontSize: 13,
            fontWeight: 600, color: "#374151", cursor: "pointer",
          }}
        >
          <span aria-hidden="true">&larr;</span> Financial
        </Link>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Financial Reconciliation</h2>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={exportCsv}
          disabled={!projectsSummary}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e7eb",
            background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: projectsSummary ? "pointer" : "not-allowed", opacity: projectsSummary ? 1 : 0.5,
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Date filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Date range:</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
        <span style={{ fontSize: 12, color: "#6b7280" }}>to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
        <button type="button" onClick={fetchAll}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e7eb",
            background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Apply
        </button>
      </div>

      {error && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {loading && <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading reconciliation data…</div>}

      {!loading && (
        <>
          {/* ── Summary Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              {
                label: "Total Transactions",
                value: totalTxns.toLocaleString(),
                color: "#3b82f6",
                bg: "#eff6ff",
              },
              {
                label: "Reconciled",
                value: reconciledCount.toLocaleString(),
                color: "#22c55e",
                bg: "#f0fdf4",
                sub: totalTxns > 0 ? `${((reconciledCount / totalTxns) * 100).toFixed(1)}%` : "",
              },
              {
                label: "Unassigned",
                value: (projectsSummary?.unassignedCount ?? 0).toLocaleString(),
                color: "#f59e0b",
                bg: "#fffbeb",
              },
              {
                label: "Total Inflow",
                value: bankSummary ? `+$${fmt(bankSummary.totalInflow)}` : "—",
                color: "#22c55e",
                bg: "#f0fdf4",
              },
              {
                label: "Total Outflow",
                value: bankSummary ? `-$${fmt(bankSummary.totalOutflow)}` : "—",
                color: "#ef4444",
                bg: "#fef2f2",
              },
              {
                label: "Net",
                value: bankSummary ? `${bankSummary.net >= 0 ? "+" : "-"}$${fmt(bankSummary.net)}` : "—",
                color: bankSummary && bankSummary.net >= 0 ? "#22c55e" : "#ef4444",
                bg: bankSummary && bankSummary.net >= 0 ? "#f0fdf4" : "#fef2f2",
              },
            ].map(c => (
              <div key={c.label} style={{
                padding: 14, borderRadius: 10, border: `1px solid ${c.color}22`,
                background: c.bg, textAlign: "center",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                {"sub" in c && c.sub && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{c.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* ── Source Comparison ── */}
          {sourceBreakdown.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Source Comparison</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                {sourceBreakdown.map(s => (
                  <div key={s.source} style={{
                    padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                      {sourceLabels[s.source] ?? s.source}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6" }}>
                      {s.count.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>transactions</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Project Breakdown ── */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
              Project Breakdown ({projectsSummary?.totalProjects ?? 0} projects)
            </h3>
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Project</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Status</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Transactions</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(!projectsSummary || projectsSummary.projects.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                        No projects with assigned transactions.
                      </td>
                    </tr>
                  )}
                  {projectsSummary?.projects.map(p => (
                    <tr key={p.projectId} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                        <Link href={`/projects/${p.projectId}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                          {p.projectName}
                        </Link>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: p.status === "ACTIVE" ? "#d1fae5" : "#f3f4f6",
                          color: p.status === "ACTIVE" ? "#065f46" : "#6b7280",
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        {p.transactionCount.toLocaleString()}
                      </td>
                      <td style={{
                        padding: "8px 10px", textAlign: "right", fontWeight: 600,
                        color: p.totalAmount >= 0 ? "#ef4444" : "#22c55e",
                      }}>
                        {p.totalAmount >= 0 ? "-" : "+"}${fmt(p.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Unassigned Transactions Queue ── */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
              Unassigned Transactions ({unassignedTotal.toLocaleString()})
            </h3>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
              Transactions not yet linked to a project. Use the dropdown to assign.
            </p>
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Description</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Merchant</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Amount</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Assign to Project</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                        {unassignedTotal === 0 ? "All transactions are assigned to projects." : "No unassigned transactions on this page."}
                      </td>
                    </tr>
                  )}
                  {unassigned.map(txn => {
                    const badge = srcBadge[txn.source] ?? { label: txn.source, bg: "#f3f4f6", color: "#6b7280" };
                    return (
                      <tr key={txn.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {new Date(txn.date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: badge.bg, color: badge.color,
                          }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{
                          padding: "8px 10px", maxWidth: 220, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }} title={txn.description}>
                          {txn.description}
                        </td>
                        <td style={{
                          padding: "8px 10px", maxWidth: 160, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {txn.extra?.jobName || txn.merchant || "—"}
                        </td>
                        <td style={{
                          padding: "8px 10px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap",
                          color: txn.amount < 0 ? "#22c55e" : "#ef4444",
                        }}>
                          {txn.amount < 0 ? "+" : "-"}${fmt(txn.amount)}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <select
                            defaultValue=""
                            onChange={e => {
                              if (e.target.value) handleAssign(txn.id, txn.source, e.target.value);
                            }}
                            style={{
                              padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db",
                              fontSize: 11, maxWidth: 180,
                            }}
                          >
                            <option value="">— Select —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination for unassigned */}
            {unassignedTotal > 20 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
                <button type="button" disabled={unassignedPage <= 1}
                  onClick={() => fetchUnassignedPage(unassignedPage - 1)}
                  style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: "pointer" }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: 12, lineHeight: "28px", color: "#6b7280" }}>
                  Page {unassignedPage} of {Math.ceil(unassignedTotal / 20)}
                </span>
                <button type="button" disabled={unassignedPage >= Math.ceil(unassignedTotal / 20)}
                  onClick={() => fetchUnassignedPage(unassignedPage + 1)}
                  style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: "pointer" }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </PageCard>
  );
}
