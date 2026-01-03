"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Designator = "WORKS_HERE" | "UP_FOR_HIRE" | "WANTS_EVALUATION_HERE" | string;

type CompanyRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT" | string;

type OnboardingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | string;

interface TradesPersonRow {
  userId: string;
  email: string;
  displayName: string;
  companyRole: CompanyRole | null;
  onboardingStatus: OnboardingStatus | null;
  designators: Designator[];
  location: {
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  hasPhoto: boolean;
  hasGovId: boolean;
  stats: {
    ratedCount: number;
    avgSelf: number | null;
  };
  skills: {
    skillId: string;
    label: string;
    tradeLabel: string | null;
    level: number;
  }[];
  createdAt?: string;
}

function formatDesignator(d: Designator) {
  if (d === "WORKS_HERE") return "Works here";
  if (d === "UP_FOR_HIRE") return "Up for hire";
  if (d === "WANTS_EVALUATION_HERE") return "Wants evaluation";
  return d;
}

export default function CompanyTradesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");

  const [rows, setRows] = useState<TradesPersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [skillSearch, setSkillSearch] = useState<string>("");
  const [regionStateFilter, setRegionStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [minAvg, setMinAvg] = useState<string>("");
  const [minRatedCount, setMinRatedCount] = useState<string>("");
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [requireGovId, setRequireGovId] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<"NAME" | "LATEST">("LATEST");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    const storedCompanyId = window.localStorage.getItem("companyId");

    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }
    if (!storedCompanyId) {
      setError("Missing company context.");
      setLoading(false);
      return;
    }

    setCompanyId(storedCompanyId);

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/onboarding/company/${storedCompanyId}/trades-people`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load tradespeople (${res.status}) ${text}`);
        }

        const json: TradesPersonRow[] = await res.json();
        setRows(Array.isArray(json) ? json : []);

        // Best-effort: show company name via localStorage-backed switcher context
        setCompanyName(storedCompanyId ?? "");
      } catch (e: any) {
        setError(e?.message ?? "Failed to load tradespeople.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const tradeOptions = useMemo(() => {
    const trades = new Set<string>();
    for (const r of rows) {
      for (const s of r.skills) {
        const t = (s.tradeLabel || "General").trim() || "General";
        trades.add(t);
      }
    }
    return Array.from(trades).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const qSkill = skillSearch.trim().toLowerCase();
    const qCity = cityFilter.trim().toLowerCase();
    const qState = regionStateFilter.trim().toLowerCase();

    const parsedMinAvg = minAvg.trim() ? Number(minAvg) : null;
    const parsedMinRated = minRatedCount.trim() ? Number(minRatedCount) : null;

    return rows
      .filter(r => {
        if (statusFilter && (r.onboardingStatus || "") !== statusFilter) return false;
        if (requirePhoto && !r.hasPhoto) return false;
        if (requireGovId && !r.hasGovId) return false;

        if (qState && (r.location.state || "").toLowerCase() !== qState) return false;
        if (qCity && !(r.location.city || "").toLowerCase().includes(qCity)) return false;

        if (tradeFilter) {
          const hasTrade = r.skills.some(s => ((s.tradeLabel || "General").trim() || "General") === tradeFilter);
          if (!hasTrade) return false;
        }

        if (qSkill) {
          const matches = r.skills.some(s => s.label.toLowerCase().includes(qSkill));
          if (!matches) return false;
        }

        if (parsedMinAvg != null) {
          if (r.stats.avgSelf == null || r.stats.avgSelf < parsedMinAvg) return false;
        }

        if (parsedMinRated != null) {
          if (r.stats.ratedCount < parsedMinRated) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortMode === "LATEST") {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (da !== db) return db - da; // newest first
        }
        const an = (a.displayName || a.email || "").toLowerCase();
        const bn = (b.displayName || b.email || "").toLowerCase();
        return an.localeCompare(bn);
      });
  }, [
    rows,
    statusFilter,
    requirePhoto,
    requireGovId,
    regionStateFilter,
    cityFilter,
    tradeFilter,
    skillSearch,
    minAvg,
    minRatedCount,
    sortMode,
  ]);

  const visibleStatuses = useMemo(() => {
    const st = new Set<string>();
    for (const r of rows) {
      if (r.onboardingStatus) st.add(r.onboardingStatus);
    }
    return Array.from(st).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>People · Trades</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Tradespeople list for {companyName || companyId || "current company"}.
      </p>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
          fontSize: 12,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Trade
          <select
            value={tradeFilter}
            onChange={e => setTradeFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 200 }}
          >
            <option value="">All trades</option>
            {tradeOptions.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Skill contains
          <input
            value={skillSearch}
            onChange={e => setSkillSearch(e.target.value)}
            placeholder="e.g. framing"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 220 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          State
          <input
            value={regionStateFilter}
            onChange={e => setRegionStateFilter(e.target.value)}
            placeholder="FL"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", width: 80 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          City
          <input
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            placeholder="Miami"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 160 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Min avg
          <input
            value={minAvg}
            onChange={e => setMinAvg(e.target.value)}
            placeholder="3.5"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", width: 90 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Min rated
          <input
            value={minRatedCount}
            onChange={e => setMinRatedCount(e.target.value)}
            placeholder="10"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", width: 90 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Status
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 180 }}
          >
            <option value="">All statuses</option>
            {visibleStatuses.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
          <input type="checkbox" checked={requirePhoto} onChange={e => setRequirePhoto(e.target.checked)} />
          Has photo
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
          <input type="checkbox" checked={requireGovId} onChange={e => setRequireGovId(e.target.checked)} />
          Has ID
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: "auto" }}>
          Sort by
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as "NAME" | "LATEST")}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 170 }}
          >
            <option value="LATEST">Latest registration</option>
            <option value="NAME">Name (A–Z)</option>
          </select>
        </label>

        <div style={{ color: "#6b7280" }}>
          Showing <strong>{filtered.length}</strong>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>Loading tradespeople…</p>
      ) : error ? (
        <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 10 }}>{error}</p>
      ) : (
        <div
          style={{
            marginTop: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Tradesperson</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Designator</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Location</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Registered</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Avg / Rated</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Top trade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const topTrade = r.skills
                  .map(s => (s.tradeLabel || "General").trim() || "General")
                  .sort()[0] || "—";

                return (
                  <tr key={r.userId}>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                      <div style={{ fontWeight: 600 }}>{r.displayName}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {r.designators.length ? (
                          r.designators.map(d => (
                            <span
                              key={d}
                              style={{
                                fontSize: 11,
                                border: "1px solid #d1d5db",
                                background: "#ffffff",
                                padding: "2px 6px",
                                borderRadius: 999,
                                color: "#111827",
                              }}
                            >
                              {formatDesignator(d)}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: 12, color: "#6b7280" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                      {(r.location.city || r.location.state)
                        ? `${r.location.city ?? ""}${r.location.city && r.location.state ? ", " : ""}${r.location.state ?? ""}`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                      {r.stats.avgSelf == null ? "—" : `${r.stats.avgSelf.toFixed(1)}/5`} · {r.stats.ratedCount}
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                      {topTrade}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
                    No tradespeople match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>
        Availability / willingness to travel / remote: not captured yet — we can add these fields to the candidate
        onboarding profile next.
      </div>
    </div>
  );
}
