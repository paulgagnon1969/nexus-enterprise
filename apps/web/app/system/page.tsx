"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/* ── Types ── */

interface AnalyticsOverview {
  period: string;
  since: string;
  workActivity: {
    activeProjects: number;
    dailyLogsInPeriod: number;
    openTasks: number;
    completedInPeriod: number;
  };
  financial: {
    totalBilledInPeriod: number;
    invoicesIssuedCount: number;
    outstandingTotal: number;
    outstandingCount: number;
  };
  messaging: {
    messagesInPeriod: number;
    activeThreads: number;
  };
  moduleUsage: Record<string, number>;
  topContributors: { name: string; logCount: number; taskCount: number; total: number }[];
  recentEvents: { type: string; text: string; by: string | null; createdAt: string }[];
}

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days" };

const MODULE_LABELS: Record<string, string> = {
  dailyLogs: "Daily Logs",
  tasks: "Tasks",
  messages: "Messaging",
  timecards: "Timecards",
  imports: "Imports",
  voiceNotes: "Voice Notes",
};

function fmt$(n: number) {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString("en-US");
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/* ── Tile wrapper ── */
/* ── Source badge colors ── */
const SOURCE_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  USER: { bg: "#dbeafe", fg: "#1e40af", label: "User" },
  CANDIDATE: { bg: "#fef3c7", fg: "#92400e", label: "Candidate" },
  CLIENT: { bg: "#d1fae5", fg: "#065f46", label: "Client" },
};

const TIER_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  exact: { bg: "#dcfce7", fg: "#166534", label: "Exact" },
  contains: { bg: "#e0e7ff", fg: "#3730a3", label: "Contains" },
  fuzzy: { bg: "#fef9c3", fg: "#854d0e", label: "Fuzzy" },
};

interface PeopleResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  tenantNames: string | null;
  globalRole: string | null;
  matchTier: string;
  score: number;
}

/* ── Profile card detail row ── */
function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12 }}>
      <span style={{ width: 120, flexShrink: 0, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#0f172a", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ProfileBadge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: bg, color: fg, marginRight: 4 }}>
      {text}
    </span>
  );
}

function PersonProfileCard({ source, id, onClose }: { source: string; id: string; onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) { setError("No token"); setLoading(false); return; }
    fetch(`${API_BASE}/admin/global-search/people/${source}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setProfile(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [source, id]);

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: "#6b7280" }}>Loading profile…</div>;
  if (error || !profile) return <div style={{ padding: 16, fontSize: 12, color: "#b91c1c" }}>Failed to load profile.</div>;

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "(unnamed)";
  const srcBadge = SOURCE_BADGE[profile.source] ?? SOURCE_BADGE.USER;

  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, margin: "0 12px 12px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{name}</span>
          <ProfileBadge text={srcBadge.label} bg={srcBadge.bg} fg={srcBadge.fg} />
          {profile.globalRole && profile.globalRole !== "NONE" && (
            <ProfileBadge text={profile.globalRole} bg="#fce7f3" fg="#9d174d" />
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9ca3af", padding: "2px 6px" }}>✕</button>
      </div>

      <div style={{ padding: "8px 14px" }}>
        {/* Common fields */}
        <ProfileRow label="Email" value={profile.email} />
        <ProfileRow label="Phone" value={profile.phone} />
        <ProfileRow label="ID" value={<span style={{ fontFamily: "monospace", fontSize: 11 }}>{profile.id}</span>} />
        <ProfileRow label="Created" value={fmtDate(profile.createdAt)} />
        <ProfileRow label="Updated" value={fmtDate(profile.updatedAt)} />

        {/* USER-specific */}
        {profile.source === "USER" && (
          <>
            <ProfileRow label="User Type" value={profile.userType} />
            <ProfileRow label="Profile %" value={profile.profileCompletion != null ? `${profile.profileCompletion}%` : null} />
            <ProfileRow label="People Token" value={<span style={{ fontFamily: "monospace", fontSize: 11 }}>{profile.peopleToken}</span>} />

            {profile.memberships?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Tenant Memberships</div>
                {profile.memberships.map((m: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{m.companyName}</span>
                    <ProfileBadge text={m.role} bg="#e0e7ff" fg="#3730a3" />
                    {m.profileLabel && <ProfileBadge text={m.profileLabel} bg="#f3f4f6" fg="#374151" />}
                    {!m.isActive && <ProfileBadge text="Inactive" bg="#fef2f2" fg="#b91c1c" />}
                    {!m.companyActive && <ProfileBadge text="Org Deactivated" bg="#fef2f2" fg="#b91c1c" />}
                    {m.blackFlagged && <ProfileBadge text="⚑ Black Flag" bg="#0f172a" fg="#ef4444" />}
                  </div>
                ))}
              </div>
            )}

            {profile.candidateProfile && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Candidate Profile</div>
                <ProfileRow label="Status" value={profile.candidateProfile.status} />
                <ProfileRow label="Source" value={profile.candidateProfile.source} />
                <ProfileRow label="Visibility" value={profile.candidateProfile.visibilityScope} />
              </div>
            )}

            {profile.recentProjects?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Projects ({profile.recentProjects.length})</div>
                {profile.recentProjects.map((p: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 11 }}>
                    <span style={{ color: "#0f172a" }}>{p.projectName}</span>
                    <ProfileBadge text={p.projectStatus} bg="#f3f4f6" fg="#374151" />
                    <span style={{ color: "#9ca3af" }}>{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* CANDIDATE-specific */}
        {profile.source === "CANDIDATE" && (
          <>
            <ProfileRow label="Status" value={profile.status} />
            <ProfileRow label="Source" value={profile.candidateSource} />
            <ProfileRow label="Visibility" value={profile.visibilityScope} />
            <ProfileRow label="Company" value={profile.companyName} />
            <ProfileRow label="Linked User" value={profile.linkedUserEmail} />
          </>
        )}

        {/* CLIENT-specific */}
        {profile.source === "CLIENT" && (
          <>
            <ProfileRow label="Display Name" value={profile.displayName} />
            <ProfileRow label="Company" value={profile.companyName} />
            <ProfileRow label="Tenant" value={profile.tenantName} />
            <ProfileRow label="Active" value={profile.active ? "Yes" : "No"} />
            <ProfileRow label="Linked User" value={profile.linkedUserEmail} />
            {profile.notes && <ProfileRow label="Notes" value={profile.notes} />}

            {profile.projects?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Projects ({profile.projects.length})</div>
                {profile.projects.map((p: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 11 }}>
                    <span style={{ color: "#0f172a" }}>{p.projectName}</span>
                    <ProfileBadge text={p.projectStatus} bg="#f3f4f6" fg="#374151" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GlobalPeopleSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeopleResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ source: string; id: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback((q: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token || q.trim().length < 2) {
      setResults([]);
      setSearched(q.trim().length >= 2);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSelectedPerson(null);
    fetch(`${API_BASE}/admin/global-search/people?q=${encodeURIComponent(q.trim())}&limit=25`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setResults(d.results ?? []); setSearched(true); })
      .catch(() => { setResults([]); setSearched(true); })
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setSearched(false); setSelectedPerson(null); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Global People Search</span>
          <span style={{ fontSize: 10, color: "#9ca3af", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>SUPER_ADMIN</span>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, or phone across all tenants and marketplace…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "8px 12px",
            fontSize: 13,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            outline: "none",
            background: "#fafafa",
          }}
        />
      </div>

      {/* Results */}
      {searching && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>Searching…</div>
      )}

      {!searching && searched && results.length === 0 && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>No people found.</div>
      )}

      {!searching && results.length > 0 && (
        <div style={{ maxHeight: selectedPerson ? 600 : 360, overflowY: "auto" }}>
          {results.map((r, i) => {
            const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "(unnamed)";
            const src = SOURCE_BADGE[r.source] ?? SOURCE_BADGE.USER;
            const tier = TIER_BADGE[r.matchTier] ?? TIER_BADGE.fuzzy;
            const isSelected = selectedPerson?.source === r.source && selectedPerson?.id === r.id;
            return (
              <div key={`${r.source}-${r.id}-${i}`}>
                <div
                  onClick={() => setSelectedPerson(isSelected ? null : { source: r.source, id: r.id })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 16px",
                    borderBottom: i < results.length - 1 && !isSelected ? "1px solid #f9fafb" : "none",
                    fontSize: 12,
                    cursor: "pointer",
                    background: isSelected ? "#f0f9ff" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "#f9fafb"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Name + email + phone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[r.email, r.phone].filter(Boolean).join(" · ")}
                    </div>
                    {r.tenantNames && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                        {r.tenantNames}
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: src.bg, color: src.fg }}>
                    {src.label}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: tier.bg, color: tier.fg }}>
                    {tier.label}
                  </span>
                  {r.globalRole && r.globalRole !== "NONE" && (
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#fce7f3", color: "#9d174d" }}>
                      {r.globalRole}
                    </span>
                  )}
                  <span style={{ flexShrink: 0, fontSize: 14, color: "#9ca3af" }}>{isSelected ? "▾" : "›"}</span>
                </div>

                {/* Expanded profile card */}
                {isSelected && (
                  <PersonProfileCard
                    source={r.source}
                    id={r.id}
                    onClose={() => setSelectedPerson(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: "1 1 280px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 4, background: accent }} />
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9ca3af" }}>{sub}</div>}
    </div>
  );
}

function ModuleBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 4;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: "#374151" }}>{label}</span>
        <span style={{ fontWeight: 600, color: "#0f172a" }}>{count.toLocaleString()}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#f3f4f6" }}>
        <div style={{ height: 6, borderRadius: 3, background: "#3b82f6", width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

/* ── Page ── */
export default function NexusSystemOverviewPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/admin/analytics/overview?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`);
        return res.json();
      })
      .then((d: AnalyticsOverview) => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  const moduleMax = data ? Math.max(...Object.values(data.moduleUsage), 1) : 1;

  return (
    <PageCard>
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: 20, fontWeight: 700 }}>
            Organization Performance Dashboard
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "#6b7280",
              background: "#f3f4f6",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            TUCKS
          </span>
        </div>

        {/* Global People Search */}
        <GlobalPeopleSearch />

        {/* Period selector + subtitle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Cross-organization KPIs and recent activity.
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            {(["7d", "30d", "90d"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: period === p ? 700 : 400,
                  borderRadius: 6,
                  border: period === p ? "1px solid #0f172a" : "1px solid #d1d5db",
                  background: period === p ? "#0f172a" : "#ffffff",
                  color: period === p ? "#ffffff" : "#374151",
                  cursor: "pointer",
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Loading / error states */}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
            Loading analytics…
          </div>
        )}
        {error && (
          <div style={{ padding: 20, fontSize: 13, color: "#b91c1c", background: "#fef2f2", borderRadius: 8 }}>
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* ── KPI Tiles Row 1 ── */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              <Tile title="Work Activity" accent="#3b82f6">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Metric label="Active Projects" value={String(data.workActivity.activeProjects)} />
                  <Metric label={`Daily Logs (${data.period})`} value={String(data.workActivity.dailyLogsInPeriod)} />
                  <Metric label="Open Tasks" value={String(data.workActivity.openTasks)} />
                  <Metric label={`Completed (${data.period})`} value={String(data.workActivity.completedInPeriod)} />
                </div>
              </Tile>

              <Tile title="Financial" accent="#10b981">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Metric
                    label={`Billed (${data.period})`}
                    value={fmt$(data.financial.totalBilledInPeriod)}
                    sub={`${data.financial.invoicesIssuedCount} invoice(s)`}
                  />
                  <Metric
                    label="Outstanding"
                    value={fmt$(data.financial.outstandingTotal)}
                    sub={`${data.financial.outstandingCount} unpaid`}
                  />
                  <Metric label={`Messages (${data.period})`} value={String(data.messaging.messagesInPeriod)} />
                  <Metric label="Active Threads" value={String(data.messaging.activeThreads)} />
                </div>
              </Tile>

              {/* Module Usage */}
              <Tile title="Module Usage" accent="#8b5cf6">
                {Object.entries(data.moduleUsage).map(([key, count]) => (
                  <ModuleBar
                    key={key}
                    label={MODULE_LABELS[key] ?? key}
                    count={count}
                    max={moduleMax}
                  />
                ))}
              </Tile>
            </div>

            {/* ── Top Contributors ── */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              <Tile title={`Top Contributors (${data.period})`} accent="#22c55e">
                {data.topContributors.length === 0 && (
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>No activity in this period.</div>
                )}
                {data.topContributors.slice(0, 5).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom:
                        i < Math.min(data.topContributors.length, 5) - 1 ? "1px solid #f3f4f6" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>
                        {c.logCount} logs · {c.taskCount} tasks
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#16a34a",
                        background: "#f0fdf4",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {c.total} total
                    </div>
                  </div>
                ))}
              </Tile>

              {/* Lowest Contributors (bottom 5 from the list) */}
              <Tile title={`Lowest Activity (${data.period})`} accent="#ef4444">
                {data.topContributors.length <= 5 && (
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>Not enough data to rank.</div>
                )}
                {data.topContributors.length > 5 &&
                  data.topContributors.slice(-5).reverse().map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: i < 4 ? "1px solid #f3f4f6" : "none",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>
                          {c.logCount} logs · {c.taskCount} tasks
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#b91c1c",
                          background: "#fef2f2",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {c.total} total
                      </div>
                    </div>
                  ))}
              </Tile>
            </div>

            {/* ── Recent Events ── */}
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #f3f4f6",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Recent Events
              </div>
              {data.recentEvents.length === 0 && (
                <div style={{ padding: 16, fontSize: 12, color: "#9ca3af" }}>No recent events.</div>
              )}
              {data.recentEvents.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    borderBottom:
                      i < data.recentEvents.length - 1 ? "1px solid #f9fafb" : "none",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        ev.type === "financial"
                          ? "#10b981"
                          : ev.type === "log"
                            ? "#3b82f6"
                            : ev.type === "task"
                              ? "#f59e0b"
                              : "#6b7280",
                    }}
                  />
                  <span style={{ flex: 1, color: "#374151" }}>{ev.text}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, color: "#9ca3af" }}>
                    {timeAgo(ev.createdAt)}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 10,
                color: "#d1d5db",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>TUCKS — Telemetry Usage Chart KPI System</span>
              <a href="/system/analytics" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}>Full Analytics Dashboard →</a>
            </div>
          </>
        )}
      </div>
    </PageCard>
  );
}
