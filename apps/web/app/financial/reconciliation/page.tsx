"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";
import { RawDetailModal, DISPOSITION_OPTIONS, getDispositionStyle } from "../../components/RawDataTable";

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

type StoreGroupItem = { id: string; description: string; amount: number; sku?: string | null; qty?: number | null };
type StoreGroup = {
  dateStr: string;
  storeNumber: string;
  totalAmount: number;
  transactionIds: string[];
  items: StoreGroupItem[];
};
type CardTxn = {
  id: string;
  source: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  cardHolder: string | null;
};
type StoreCardMatch = {
  storeGroup: StoreGroup;
  cardTransaction: CardTxn;
  amountDiff: number;
  dateDiffDays: number;
};
type StoreCardData = {
  matches: StoreCardMatch[];
  unmatchedStoreGroups: StoreGroup[];
  unmatchedCards: CardTxn[];
  summary: { totalMatches: number; totalUnmatchedStoreGroups: number; totalUnmatchedCards: number };
};

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

  // Disposition filter
  const [dispositionFilter, setDispositionFilter] = useState<string>("UNREVIEWED");
  const [dispositionCounts, setDispositionCounts] = useState<Record<string, number>>({});

  // Store-to-card reconciliation
  const [storeCardData, setStoreCardData] = useState<StoreCardData | null>(null);
  const [storeCardLoading, setStoreCardLoading] = useState(false);
  const [storeCardExpanded, setStoreCardExpanded] = useState(false);
  const [storeCardTab, setStoreCardTab] = useState<"matches" | "unmatchedStore" | "unmatchedCard">("matches");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Raw detail modal
  const [rawDetailOpen, setRawDetailOpen] = useState(false);
  const [rawDetailTxn, setRawDetailTxn] = useState<Record<string, any> | null>(null);
  const [rawDetailSource, setRawDetailSource] = useState<string>("");

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

      const [projRes, summRes, unassRes, projListRes, dispCountRes] = await Promise.all([
        fetch(`${API_BASE}/banking/projects-summary${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/banking/transactions/summary${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/banking/transactions/unified?disposition=${dispositionFilter}&pageSize=20&sortBy=date&sortDir=desc${qs ? "&" + params : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/banking/disposition-counts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (projRes.ok) setProjectsSummary(await projRes.json());
      if (summRes.ok) setBankSummary(await summRes.json());
      if (dispCountRes.ok) setDispositionCounts(await dispCountRes.json());
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

      // Fetch store-to-card matches
      fetchStoreCardMatches(token, params);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load reconciliation data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchStoreCardMatches(token: string, params: URLSearchParams) {
    setStoreCardLoading(true);
    try {
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(`${API_BASE}/banking/reconciliation/store-card-matches${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStoreCardData(await res.json());
    } catch {} finally {
      setStoreCardLoading(false);
    }
  }

  async function handleLinkMatch(match: StoreCardMatch) {
    const token = getToken();
    if (!token) return;
    setLinkingId(match.cardTransaction.id);
    try {
      const res = await fetch(`${API_BASE}/banking/reconciliation/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeTransactionIds: match.storeGroup.transactionIds,
          cardTransactionId: match.cardTransaction.id,
        }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      // Remove from matches list optimistically
      setStoreCardData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          matches: prev.matches.filter(m => m.cardTransaction.id !== match.cardTransaction.id),
          summary: {
            ...prev.summary,
            totalMatches: prev.summary.totalMatches - 1,
          },
        };
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to link");
    } finally {
      setLinkingId(null);
    }
  }

  async function handleDismissMatch(match: StoreCardMatch) {
    // Move to unmatched lists (no backend call, just UI shuffle)
    setStoreCardData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.filter(m => m.cardTransaction.id !== match.cardTransaction.id),
        unmatchedStoreGroups: [...prev.unmatchedStoreGroups, match.storeGroup],
        unmatchedCards: [...prev.unmatchedCards, match.cardTransaction],
        summary: {
          ...prev.summary,
          totalMatches: prev.summary.totalMatches - 1,
          totalUnmatchedStoreGroups: prev.summary.totalUnmatchedStoreGroups + 1,
          totalUnmatchedCards: prev.summary.totalUnmatchedCards + 1,
        },
      };
    });
  }

  async function fetchUnassignedPage(page: number) {
    const token = getToken();
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set("disposition", dispositionFilter);
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

          {/* ── Store-to-Card Reconciliation ── */}
          {storeCardData && (storeCardData.summary.totalMatches > 0 || storeCardData.summary.totalUnmatchedStoreGroups > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}
                onClick={() => setStoreCardExpanded(!storeCardExpanded)}
              >
                <span style={{ fontSize: 13, transform: storeCardExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9654;</span>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                  Store ↔ Card Matching
                </h3>
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, background: "#f0fdf4", padding: "2px 8px", borderRadius: 4 }}>
                  {storeCardData.summary.totalMatches} match{storeCardData.summary.totalMatches !== 1 ? "es" : ""}
                </span>
                <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, background: "#fffbeb", padding: "2px 8px", borderRadius: 4 }}>
                  {storeCardData.summary.totalUnmatchedStoreGroups} unmatched HD
                </span>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, background: "#f3f4f6", padding: "2px 8px", borderRadius: 4 }}>
                  {storeCardData.summary.totalUnmatchedCards} unmatched card
                </span>
              </div>

              {storeCardExpanded && (
                <>
                  {/* Tab bar */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {(["matches", "unmatchedStore", "unmatchedCard"] as const).map(tab => {
                      const labels = { matches: "Matches", unmatchedStore: "Unmatched HD", unmatchedCard: "Unmatched Cards" };
                      const counts = {
                        matches: storeCardData.summary.totalMatches,
                        unmatchedStore: storeCardData.summary.totalUnmatchedStoreGroups,
                        unmatchedCard: storeCardData.summary.totalUnmatchedCards,
                      };
                      return (
                        <button key={tab} type="button" onClick={() => setStoreCardTab(tab)} style={{
                          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          border: storeCardTab === tab ? "1px solid #2563eb" : "1px solid #d1d5db",
                          background: storeCardTab === tab ? "#eff6ff" : "#fff",
                          color: storeCardTab === tab ? "#2563eb" : "#374151",
                        }}>
                          {labels[tab]} ({counts[tab]})
                        </button>
                      );
                    })}
                  </div>

                  {/* Matches tab */}
                  {storeCardTab === "matches" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {storeCardData.matches.length === 0 && (
                        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                          No matches found. Try importing both HD and card CSVs with overlapping date ranges.
                        </div>
                      )}
                      {storeCardData.matches.map((m, idx) => (
                        <div key={idx} style={{
                          border: "1px solid #d1fae5", borderRadius: 10, padding: 14,
                          background: "#f0fdf4", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap",
                        }}>
                          {/* Left: HD store group */}
                          <div style={{ flex: 1, minWidth: 240 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", marginBottom: 4 }}>
                              HD Store #{m.storeGroup.storeNumber} — {m.storeGroup.dateStr}
                            </div>
                            <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                              {m.storeGroup.items.length} item{m.storeGroup.items.length !== 1 ? "s" : ""}
                            </div>
                            {m.storeGroup.items.slice(0, 5).map((item, i) => (
                              <div key={i} style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
                                {item.qty ? `${item.qty}× ` : ""}{item.description.slice(0, 40)}{item.description.length > 40 ? "..." : ""} — ${fmt(item.amount)}
                              </div>
                            ))}
                            {m.storeGroup.items.length > 5 && (
                              <div style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>+{m.storeGroup.items.length - 5} more</div>
                            )}
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#c2410c", marginTop: 4 }}>
                              Total: ${fmt(m.storeGroup.totalAmount)}
                            </div>
                          </div>

                          {/* Center: match indicator */}
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            padding: "8px 0", minWidth: 60,
                          }}>
                            <span style={{ fontSize: 18 }}>↔</span>
                            <span style={{ fontSize: 10, color: m.amountDiff === 0 ? "#22c55e" : "#f59e0b" }}>
                              {m.amountDiff === 0 ? "Exact" : `±$${m.amountDiff.toFixed(2)}`}
                            </span>
                            {m.dateDiffDays > 0 && (
                              <span style={{ fontSize: 10, color: "#9ca3af" }}>{m.dateDiffDays}d offset</span>
                            )}
                          </div>

                          {/* Right: card transaction */}
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                              {m.cardTransaction.source === "APPLE_CARD" ? "Apple Card" : "Chase"} — {m.cardTransaction.date}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              {m.cardTransaction.description}
                            </div>
                            {m.cardTransaction.merchant && (
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{m.cardTransaction.merchant}</div>
                            )}
                            {m.cardTransaction.cardHolder && (
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{m.cardTransaction.cardHolder}</div>
                            )}
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 4 }}>
                              ${fmt(m.cardTransaction.amount)}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 80 }}>
                            <button
                              type="button"
                              onClick={() => handleLinkMatch(m)}
                              disabled={linkingId === m.cardTransaction.id}
                              style={{
                                padding: "6px 12px", borderRadius: 6, border: "none",
                                background: "#22c55e", color: "#fff", fontSize: 11, fontWeight: 700,
                                cursor: linkingId === m.cardTransaction.id ? "not-allowed" : "pointer",
                                opacity: linkingId === m.cardTransaction.id ? 0.6 : 1,
                              }}
                            >
                              {linkingId === m.cardTransaction.id ? "Linking..." : "Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissMatch(m)}
                              style={{
                                padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db",
                                background: "#fff", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unmatched HD tab */}
                  {storeCardTab === "unmatchedStore" && (
                    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead style={{ background: "#f9fafb" }}>
                          <tr>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Date</th>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Store #</th>
                            <th style={{ textAlign: "right", padding: "8px 10px" }}>Items</th>
                            <th style={{ textAlign: "right", padding: "8px 10px" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storeCardData.unmatchedStoreGroups.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>All HD store groups matched.</td></tr>
                          )}
                          {storeCardData.unmatchedStoreGroups.map((g, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                              <td style={{ padding: "8px 10px" }}>{g.dateStr}</td>
                              <td style={{ padding: "8px 10px" }}>#{g.storeNumber}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right" }}>{g.items.length}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>${fmt(g.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Unmatched Cards tab */}
                  {storeCardTab === "unmatchedCard" && (
                    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead style={{ background: "#f9fafb" }}>
                          <tr>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Date</th>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Source</th>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Description</th>
                            <th style={{ textAlign: "left", padding: "8px 10px" }}>Merchant</th>
                            <th style={{ textAlign: "right", padding: "8px 10px" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storeCardData.unmatchedCards.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>All card transactions matched.</td></tr>
                          )}
                          {storeCardData.unmatchedCards.map((c, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                              <td style={{ padding: "8px 10px" }}>{c.date}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                                  background: c.source === "APPLE_CARD" ? "#f3f4f6" : "#dbeafe",
                                  color: c.source === "APPLE_CARD" ? "#374151" : "#2563eb",
                                }}>
                                  {c.source === "APPLE_CARD" ? "Apple" : "Chase"}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.description}
                              </td>
                              <td style={{ padding: "8px 10px" }}>{c.merchant || "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>${fmt(c.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
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

          {/* ── Transaction Queue ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                Transactions ({unassignedTotal.toLocaleString()})
              </h3>
              {/* Disposition filter tabs */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {DISPOSITION_OPTIONS.map((opt) => {
                  const count = dispositionCounts[opt.value] ?? 0;
                  const active = dispositionFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setDispositionFilter(opt.value);
                        // Re-fetch with new filter
                        setTimeout(() => fetchAll(), 0);
                      }}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: active ? `1px solid ${opt.color}` : "1px solid #e5e7eb",
                        background: active ? opt.bg : "#fff",
                        color: active ? opt.color : "#6b7280",
                      }}
                    >
                      {opt.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
              {dispositionFilter === "UNREVIEWED" ? "Transactions not yet reviewed. Assign to a project or set a disposition." : `Showing transactions with disposition: ${getDispositionStyle(dispositionFilter).label}`}
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
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Disposition</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Assign to Project</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                        {unassignedTotal === 0
                          ? (dispositionFilter === "UNREVIEWED" ? "All transactions have been reviewed!" : `No transactions with disposition: ${getDispositionStyle(dispositionFilter).label}`)
                          : "No transactions on this page."}
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
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {(() => {
                            const d = txn.extra?.disposition ?? "UNREVIEWED";
                            const style = getDispositionStyle(d);
                            return (
                              <select
                                value={d}
                                onChange={async (e) => {
                                  const newDisp = e.target.value;
                                  if (newDisp === d) return;
                                  const token = getToken();
                                  if (!token) return;
                                  try {
                                    await fetch(`${API_BASE}/banking/transactions/${txn.id}/disposition`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({ source: txn.source, disposition: newDisp, note: `Quick disposition: ${getDispositionStyle(newDisp).label}` }),
                                    });
                                    // Remove from list if no longer matching filter
                                    if (newDisp !== dispositionFilter) {
                                      setUnassigned(prev => prev.filter(t => t.id !== txn.id));
                                      setUnassignedTotal(prev => Math.max(0, prev - 1));
                                    }
                                  } catch {}
                                }}
                                style={{
                                  padding: "2px 4px",
                                  borderRadius: 4,
                                  border: `1px solid ${style.color}`,
                                  background: style.bg,
                                  color: style.color,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  maxWidth: 120,
                                }}
                              >
                                {DISPOSITION_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            );
                          })()}
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
                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const flat = txn.extra ? { ...txn, ...txn.extra } : { ...txn };
                              setRawDetailTxn(flat);
                              setRawDetailSource(txn.source);
                              setRawDetailOpen(true);
                            }}
                            title="View raw data"
                            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, padding: 0, color: "#6b7280" }}
                          >
                            🔍
                          </button>
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
      {/* Raw Detail Modal */}
      <RawDetailModal
        open={rawDetailOpen}
        onClose={() => setRawDetailOpen(false)}
        source={rawDetailSource}
        data={rawDetailTxn}
        transactionId={rawDetailTxn?.id ?? undefined}
        onDispositionSaved={(txnId, newDisp) => {
          // Remove from list if no longer matching filter
          if (newDisp !== dispositionFilter) {
            setUnassigned(prev => prev.filter(t => t.id !== txnId));
            setUnassignedTotal(prev => Math.max(0, prev - 1));
          }
        }}
      />
    </PageCard>
  );
}
