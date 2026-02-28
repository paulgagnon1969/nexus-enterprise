"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/* ── Types ── */

interface TimeSeriesPoint {
  day: string;
  logs: number;
  tasks: number;
  messages: number;
}

interface UserActivity {
  userId: string;
  name: string;
  email: string;
  logs: number;
  tasks: number;
  messages: number;
  timecards: number;
  total: number;
}

interface GamingFlag {
  id: string;
  flagDate: string;
  gamingScore: number;
  severity: "RED" | "AMBER";
  status: string;
  userName: string;
  createdAt: string;
}

interface GamingSummary {
  counts: { pending: number; confirmed: number; dismissed: number; coached: number; total: number };
  recentFlags: GamingFlag[];
}

type Period = "7d" | "30d" | "90d";
type SortKey = "total" | "logs" | "tasks" | "messages" | "timecards" | "name";

const PERIOD_LABELS: Record<Period, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days" };

/* ── SVG Area Chart ── */

function AreaChart({
  data,
  width = 800,
  height = 220,
}: {
  data: TimeSeriesPoint[];
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;

  const pad = { top: 20, right: 16, bottom: 32, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const maxVal = Math.max(...data.flatMap(d => [d.logs, d.tasks, d.messages]), 1);
  const xStep = data.length > 1 ? w / (data.length - 1) : w;

  function toPath(key: "logs" | "tasks" | "messages") {
    return data
      .map((d, i) => {
        const x = pad.left + i * xStep;
        const y = pad.top + h - (d[key] / maxVal) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function toArea(key: "logs" | "tasks" | "messages") {
    const base = pad.top + h;
    const linePoints = data.map((d, i) => {
      const x = pad.left + i * xStep;
      const y = pad.top + h - (d[key] / maxVal) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M${pad.left},${base} L${linePoints.join(" L")} L${pad.left + (data.length - 1) * xStep},${base} Z`;
  }

  // X-axis labels (show ~6–8 labels max)
  const labelInterval = Math.max(1, Math.floor(data.length / 7));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => {
        const y = pad.top + h - frac * h;
        return (
          <g key={frac}>
            <line x1={pad.left} y1={y} x2={pad.left + w} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
              {Math.round(maxVal * frac)}
            </text>
          </g>
        );
      })}

      {/* Area fills */}
      <path d={toArea("logs")} fill="#3b82f6" opacity={0.12} />
      <path d={toArea("tasks")} fill="#f59e0b" opacity={0.10} />
      <path d={toArea("messages")} fill="#8b5cf6" opacity={0.08} />

      {/* Lines */}
      <path d={toPath("logs")} fill="none" stroke="#3b82f6" strokeWidth={2} />
      <path d={toPath("tasks")} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" />
      <path d={toPath("messages")} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="2 2" />

      {/* X-axis labels */}
      {data.map((d, i) =>
        i % labelInterval === 0 ? (
          <text
            key={d.day}
            x={pad.left + i * xStep}
            y={height - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#9ca3af"
          >
            {new Date(d.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ) : null,
      )}

      {/* Dots on last point */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        const x = pad.left + (data.length - 1) * xStep;
        return (
          <>
            <circle cx={x} cy={pad.top + h - (last.logs / maxVal) * h} r={3} fill="#3b82f6" />
            <circle cx={x} cy={pad.top + h - (last.tasks / maxVal) * h} r={3} fill="#f59e0b" />
            <circle cx={x} cy={pad.top + h - (last.messages / maxVal) * h} r={3} fill="#8b5cf6" />
          </>
        );
      })()}
    </svg>
  );
}

/* ── CSV Export ── */

function downloadCsv(users: UserActivity[], period: string) {
  const header = "Name,Email,Logs,Tasks,Messages,Timecards,Total";
  const rows = users.map(u => `"${u.name}","${u.email}",${u.logs},${u.tasks},${u.messages},${u.timecards},${u.total}`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tucks-user-activity-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Page ── */

export default function TucksAnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [gaming, setGaming] = useState<GamingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  useEffect(() => {
    if (!token) { setError("Missing access token."); setLoading(false); return; }

    setLoading(true);
    setError(null);

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/admin/analytics/time-series?period=${period}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/admin/analytics/user-activity?period=${period}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/admin/analytics/gaming-summary`, { headers }).then(r => r.ok ? r.json() : null),
    ])
      .then(([ts, ua, gs]) => {
        if (ts?.series) setTimeSeries(ts.series);
        if (ua?.users) setUsers(ua.users);
        if (gs) setGaming(gs);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [period, token]);

  const sortedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      const aVal = sortKey === "name" ? a.name : a[sortKey];
      const bVal = sortKey === "name" ? b.name : b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [users, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey, sortAsc]);

  // Totals
  const totals = useMemo(() => ({
    logs: timeSeries.reduce((s, d) => s + d.logs, 0),
    tasks: timeSeries.reduce((s, d) => s + d.tasks, 0),
    messages: timeSeries.reduce((s, d) => s + d.messages, 0),
  }), [timeSeries]);

  return (
    <PageCard>
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: 20, fontWeight: 700 }}>
            TUCKS Analytics
          </h2>
          <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 999 }}>
            Phase 5
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Time-series activity, user engagement, and gaming detection across all tenants.
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            {(["7d", "30d", "90d"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "4px 10px", fontSize: 11,
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

        {loading && <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#6b7280" }}>Loading analytics…</div>}
        {error && <div style={{ padding: 20, fontSize: 13, color: "#b91c1c", background: "#fef2f2", borderRadius: 8 }}>{error}</div>}

        {!loading && !error && (
          <>
            {/* ── Activity Trend Chart ── */}
            <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Activity Trend</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                  <span><span style={{ color: "#3b82f6" }}>●</span> Logs ({totals.logs})</span>
                  <span><span style={{ color: "#f59e0b" }}>●</span> Tasks ({totals.tasks})</span>
                  <span><span style={{ color: "#8b5cf6" }}>●</span> Messages ({totals.messages})</span>
                </div>
              </div>
              <div style={{ padding: "8px 16px 12px" }}>
                <AreaChart data={timeSeries} />
              </div>
            </div>

            {/* ── Summary KPI Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Total Logs", value: totals.logs, color: "#3b82f6" },
                { label: "Total Tasks", value: totals.tasks, color: "#f59e0b" },
                { label: "Total Messages", value: totals.messages, color: "#8b5cf6" },
                { label: "Active Users", value: users.length, color: "#16a34a" },
              ].map(kpi => (
                <div key={kpi.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: `3px solid ${kpi.color}`, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{kpi.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{kpi.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* ── User Activity Table ── */}
            <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>User Activity ({PERIOD_LABELS[period]})</div>
                <button
                  onClick={() => downloadCsv(sortedUsers, period)}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer", color: "#374151" }}
                >
                  Export CSV
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                      {([
                        ["name", "User"],
                        ["logs", "Logs"],
                        ["tasks", "Tasks"],
                        ["messages", "Messages"],
                        ["timecards", "Timecards"],
                        ["total", "Total"],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          style={{ padding: "8px 12px", textAlign: key === "name" ? "left" : "right", cursor: "pointer", fontWeight: 600, color: "#374151", userSelect: "none", whiteSpace: "nowrap" }}
                        >
                          {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.slice(0, 50).map((u, i) => (
                      <tr key={u.userId} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                        <td style={{ padding: "6px 12px", fontWeight: 500 }}>
                          {u.name}
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>{u.email}</div>
                        </td>
                        <td style={{ padding: "6px 12px", textAlign: "right", color: "#3b82f6", fontWeight: 600 }}>{u.logs}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>{u.tasks}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", color: "#8b5cf6", fontWeight: 600 }}>{u.messages}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", color: "#6b7280" }}>{u.timecards}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700 }}>{u.total}</td>
                      </tr>
                    ))}
                    {users.length > 50 && (
                      <tr><td colSpan={6} style={{ padding: "8px 12px", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>Showing top 50 of {users.length} active users</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Gaming Detection Summary ── */}
            {gaming && (
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Gaming Detection</div>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{gaming.counts.total} total flag(s)</span>
                </div>
                <div style={{ padding: 16 }}>
                  {/* Counts row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { label: "Pending", value: gaming.counts.pending, bg: "#fef3c7", color: "#92400e" },
                      { label: "Confirmed", value: gaming.counts.confirmed, bg: "#fee2e2", color: "#991b1b" },
                      { label: "Coached", value: gaming.counts.coached, bg: "#dbeafe", color: "#1e40af" },
                      { label: "Dismissed", value: gaming.counts.dismissed, bg: "#f3f4f6", color: "#374151" },
                    ].map(c => (
                      <div key={c.label} style={{ textAlign: "center", padding: "10px 8px", borderRadius: 6, background: c.bg }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 10, color: c.color, fontWeight: 500 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Recent flags */}
                  {gaming.recentFlags.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Recent Flags</div>
                      {gaming.recentFlags.slice(0, 10).map((f, i) => (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < Math.min(gaming.recentFlags.length, 10) - 1 ? "1px solid #f3f4f6" : undefined }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: f.severity === "RED" ? "#dc2626" : "#f59e0b" }} />
                          <span style={{ fontSize: 12, fontWeight: 500, minWidth: 100 }}>{f.userName}</span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {new Date(f.flagDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: f.severity === "RED" ? "#dc2626" : "#f59e0b" }}>
                            {(f.gamingScore * 100).toFixed(0)}%
                          </span>
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600,
                            background: f.status === "PENDING" ? "#fef3c7" : f.status === "CONFIRMED" ? "#fee2e2" : f.status === "COACHED" ? "#dbeafe" : "#f3f4f6",
                            color: f.status === "PENDING" ? "#92400e" : f.status === "CONFIRMED" ? "#991b1b" : f.status === "COACHED" ? "#1e40af" : "#374151",
                          }}>
                            {f.status}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {gaming.recentFlags.length === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>No gaming flags detected yet. The scoring pipeline runs daily at 2:30 AM UTC.</div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ fontSize: 10, color: "#d1d5db", display: "flex", justifyContent: "space-between" }}>
              <span>TUCKS — Telemetry Usage Chart KPI System · Phase 5 · Full Reporting Dashboard</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
          </>
        )}
      </div>
    </PageCard>
  );
}
