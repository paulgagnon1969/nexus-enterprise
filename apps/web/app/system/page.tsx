"use client";

import { PageCard } from "../ui-shell";

/* ── Dummy KPI data (replace with real API calls once KPI module is built) ── */

const DUMMY_KPIS = {
  workActivity: {
    activeProjects: 47,
    dailyLogsToday: 23,
    openTasks: 134,
    completedThisWeek: 58,
  },
  financial: {
    totalBilled: 2_340_000,
    outstanding: 412_000,
    budgetVariance: -3.2,
    avgMargin: 18.7,
  },
  projectEfficiency: {
    onSchedule: 31,
    behind: 9,
    ahead: 7,
    avgCompletion: 62,
  },
  topPerformers: [
    { name: "Marcus Rivera", metric: "98% on-time", role: "Foreman" },
    { name: "Sarah Chen", metric: "47 tasks closed", role: "PM" },
    { name: "James Okafor", metric: "22 logs filed", role: "Superintendent" },
  ],
  lowPerformers: [
    { name: "Unit 7B Crew", metric: "3 missed deadlines", role: "Crew" },
    { name: "NE Division", metric: "12% over budget", role: "Division" },
    { name: "Vendor: ABC Elec", metric: "5 late deliveries", role: "Vendor" },
  ],
  recentEvents: [
    { time: "10 min ago", text: "Daily log submitted — Riverside Phase II", type: "log" },
    { time: "25 min ago", text: "Invoice #4821 approved — Summit Tower", type: "financial" },
    { time: "1 hr ago", text: "New project created — Harbor District Demo", type: "project" },
    { time: "2 hrs ago", text: "Safety cert expired — Marcus Rivera (renewed)", type: "cert" },
    { time: "3 hrs ago", text: "Change order #12 approved — Eastside Medical", type: "financial" },
    { time: "5 hrs ago", text: "Timecard batch approved — Week of 2/17", type: "time" },
  ],
};

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US");
}

/* ── Tile wrapper ── */
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

/* ── Page ── */
export default function NexusSystemOverviewPage() {
  const k = DUMMY_KPIS;

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
            NEXUS SYSTEM
          </span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginBottom: 20 }}>
          Cross-organization KPIs and recent activity. Select an organization on the left for
          tenant-specific reporting.
        </p>

        {/* ── KPI Tiles Row 1 ── */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          {/* Work Activity */}
          <Tile title="Work Activity" accent="#3b82f6">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Metric label="Active Projects" value={String(k.workActivity.activeProjects)} />
              <Metric label="Daily Logs Today" value={String(k.workActivity.dailyLogsToday)} />
              <Metric label="Open Tasks" value={String(k.workActivity.openTasks)} />
              <Metric label="Completed This Week" value={String(k.workActivity.completedThisWeek)} />
            </div>
          </Tile>

          {/* Financial Analysis */}
          <Tile title="Financial Analysis" accent="#10b981">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Metric label="Total Billed" value={fmt$(k.financial.totalBilled)} />
              <Metric label="Outstanding" value={fmt$(k.financial.outstanding)} />
              <Metric
                label="Budget Variance"
                value={`${k.financial.budgetVariance}%`}
                sub="across all projects"
              />
              <Metric label="Avg Margin" value={`${k.financial.avgMargin}%`} />
            </div>
          </Tile>

          {/* Project Efficiency */}
          <Tile title="Project Efficiency" accent="#f59e0b">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Metric label="On Schedule" value={String(k.projectEfficiency.onSchedule)} />
              <Metric label="Behind Schedule" value={String(k.projectEfficiency.behind)} />
              <Metric label="Ahead of Schedule" value={String(k.projectEfficiency.ahead)} />
              <Metric label="Avg Completion" value={`${k.projectEfficiency.avgCompletion}%`} />
            </div>
          </Tile>
        </div>

        {/* ── KPI Tiles Row 2 ── */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          {/* Most Productive */}
          <Tile title="Most Productive" accent="#22c55e">
            {k.topPerformers.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom:
                    i < k.topPerformers.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{p.role}</div>
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
                  {p.metric}
                </div>
              </div>
            ))}
          </Tile>

          {/* Least Productive */}
          <Tile title="Least Productive" accent="#ef4444">
            {k.lowPerformers.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom:
                    i < k.lowPerformers.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{p.role}</div>
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
                  {p.metric}
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
          {k.recentEvents.map((ev, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderBottom:
                  i < k.recentEvents.length - 1 ? "1px solid #f9fafb" : "none",
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
                        : ev.type === "cert"
                          ? "#f59e0b"
                          : ev.type === "time"
                            ? "#8b5cf6"
                            : "#6b7280",
                }}
              />
              <span style={{ flex: 1, color: "#374151" }}>{ev.text}</span>
              <span style={{ flexShrink: 0, fontSize: 11, color: "#9ca3af" }}>
                {ev.time}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "#9ca3af",
            fontStyle: "italic",
          }}
        >
          Dashboard data is placeholder — will be replaced by live KPI module feeds.
        </div>
      </div>
    </PageCard>
  );
}
