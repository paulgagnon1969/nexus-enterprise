"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type AgreementStatus = "DRAFT" | "PENDING_SIGNATURES" | "PARTIALLY_SIGNED" | "FULLY_EXECUTED" | "VOIDED" | "EXPIRED";

interface AgreementSummary {
  id: string;
  title: string;
  agreementNumber: string;
  status: AgreementStatus;
  createdAt: string;
  sentAt: string | null;
  fullyExecutedAt: string | null;
  template: { id: string; code: string; title: string; category: string } | null;
  project: { id: string; name: string } | null;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  signatories: { id: string; role: string; name: string; signedAt: string | null }[];
}

interface Stats {
  draft: number;
  pending: number;
  partial: number;
  executed: number;
  voided: number;
  total: number;
}

interface TemplateOption {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  jurisdiction: string | null;
}

const STATUS_CONFIG: Record<AgreementStatus, { label: string; bg: string; color: string }> = {
  DRAFT: { label: "Draft", bg: "#f3f4f6", color: "#374151" },
  PENDING_SIGNATURES: { label: "Pending Signatures", bg: "#fef3c7", color: "#92400e" },
  PARTIALLY_SIGNED: { label: "Partially Signed", bg: "#dbeafe", color: "#1e40af" },
  FULLY_EXECUTED: { label: "Fully Executed", bg: "#d1fae5", color: "#065f46" },
  VOIDED: { label: "Voided", bg: "#fee2e2", color: "#991b1b" },
  EXPIRED: { label: "Expired", bg: "#e5e7eb", color: "#6b7280" },
};

export default function AgreementsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AgreementStatus | "">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  // New agreement form
  const [showCreate, setShowCreate] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/agreements/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [token]);

  const fetchAgreements = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "25" });
      if (statusFilter) params.set("status", statusFilter);
      if (searchTerm) params.set("search", searchTerm);
      const res = await fetch(`${API_BASE}/agreements?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load agreements (${res.status})`);
      const data = await res.json();
      setAgreements(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, searchTerm]);

  useEffect(() => {
    const storedRole = localStorage.getItem("companyRole");
    setUserRole(storedRole);
    fetchStats();
    fetchAgreements();
  }, [fetchStats, fetchAgreements]);

  const fetchTemplates = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/agreements/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTemplates(await res.json());
    } catch {}
  };

  const handleCreate = async () => {
    if (!token || !newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/agreements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newTitle.trim(),
          templateId: selectedTemplateId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create agreement");
      }
      const created = await res.json();
      setShowCreate(false);
      setNewTitle("");
      setSelectedTemplateId("");
      // Navigate to the new agreement
      window.location.href = `/financial/agreements/${created.id}`;
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";
  const pageSize = 25;

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Link href="/financial" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
                ← Financial
              </Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 20 }}>📑 Agreements & Contracts</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
              Create, manage, and sign contract packages for your organization.
            </p>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href="/financial/agreements/templates/builder"
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                  background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600,
                  textDecoration: "none", display: "inline-flex", alignItems: "center",
                }}
              >
                📝 Template Builder
              </Link>
              <button
                onClick={() => { setShowCreate(true); fetchTemplates(); }}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "none",
                  background: "#0f172a", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                + New Agreement
              </button>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {[
              { label: "Draft", value: stats.draft, color: "#374151" },
              { label: "Pending", value: stats.pending, color: "#92400e" },
              { label: "Partial", value: stats.partial, color: "#1e40af" },
              { label: "Executed", value: stats.executed, color: "#065f46" },
              { label: "Voided", value: stats.voided, color: "#991b1b" },
              { label: "Total", value: stats.total, color: "#0f172a" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: 14, borderRadius: 10, border: "1px solid #e5e7eb",
                  background: "#fff", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search agreements…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") fetchAgreements(1); }}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 220 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AgreementStatus | "")}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_SIGNATURES">Pending Signatures</option>
            <option value="PARTIALLY_SIGNED">Partially Signed</option>
            <option value="FULLY_EXECUTED">Fully Executed</option>
            <option value="VOIDED">Voided</option>
          </select>
          <button
            onClick={() => fetchAgreements(1)}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e7eb",
              background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Agreements Table */}
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Agreement #</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Title</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Template</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Project</th>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Status</th>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Signatories</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading…</td></tr>
              )}
              {!loading && agreements.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                    No agreements found. {isAdmin && "Click \"+ New Agreement\" to create one."}
                  </td>
                </tr>
              )}
              {!loading && agreements.map((agr) => {
                const sc = STATUS_CONFIG[agr.status] ?? STATUS_CONFIG.DRAFT;
                const signed = agr.signatories.filter((s) => s.signedAt).length;
                return (
                  <tr key={agr.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                      <Link
                        href={`/financial/agreements/${agr.id}`}
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {agr.agreementNumber}
                      </Link>
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {agr.title}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280" }}>
                      {agr.template?.title ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280" }}>
                      {agr.project?.name ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: sc.bg, color: sc.color,
                      }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span style={{ fontSize: 11 }}>
                        {signed}/{agr.signatories.length} signed
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>
                      {new Date(agr.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => fetchAgreements(page - 1)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: "pointer" }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 12, lineHeight: "28px", color: "#6b7280" }}>
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => fetchAgreements(page + 1)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: "pointer" }}
            >
              Next →
            </button>
          </div>
        )}

        {/* Create Agreement Modal */}
        {showCreate && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
              alignItems: "center", justifyContent: "center", zIndex: 1000,
            }}
            onClick={() => setShowCreate(false)}
          >
            <div
              style={{
                background: "#fff", borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh",
                overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>New Agreement</h2>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. FL Contingency Agreement — Smith Property"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                  Template (optional)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                >
                  <option value="">— Blank agreement —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.category}] {t.title} {t.jurisdiction ? `(${t.jurisdiction})` : ""}
                    </option>
                  ))}
                </select>
                {selectedTemplateId && templates.find((t) => t.id === selectedTemplateId)?.description && (
                  <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    {templates.find((t) => t.id === selectedTemplateId)?.description}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none", background: "#0f172a",
                    color: "#fff", fontSize: 13, fontWeight: 600, cursor: creating ? "not-allowed" : "pointer",
                    opacity: creating || !newTitle.trim() ? 0.5 : 1,
                  }}
                >
                  {creating ? "Creating…" : "Create Agreement"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageCard>
  );
}
