"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/* ── Types ── */

interface ComponentsFI {
  receiptCoverage: number;
  dupDetection: number;
  pricingAccuracy: number;
  reconciliation: number;
}
interface ComponentsPC {
  taskCompletion: number;
  assessmentAssignment: number;
  scanUtilization: number;
  reviewCycleHrs: number;
}
interface ComponentsCO {
  stubbed: boolean;
  note: string;
}
interface ComponentsDQ {
  aiLearning: number;
  fleetConsistency: number;
  assessmentConfidence: number;
}

interface NexIntScore {
  composite: number;
  fi: number;
  pc: number;
  co: number;
  dq: number;
  components: {
    fi: ComponentsFI;
    pc: ComponentsPC;
    co: ComponentsCO;
    dq: ComponentsDQ;
  };
}

interface TrendPoint {
  date: string;
  composite: number;
  fi: number;
  pc: number;
  co: number;
  dq: number;
}

interface NexIntDashboard {
  current: NexIntScore;
  trend: TrendPoint[];
  industryBaseline: { fi: number; pc: number; co: number; dq: number; composite: number };
  delta30d: { composite: number; fi: number; pc: number; co: number; dq: number } | null;
}

/* ── Dimension config ── */

const DIMS: { key: "fi" | "pc" | "co" | "dq"; label: string; fullLabel: string; weight: string; color: string }[] = [
  { key: "fi", label: "FI", fullLabel: "Financial Integrity", weight: "35%", color: "#10b981" },
  { key: "pc", label: "PC", fullLabel: "Process Completion", weight: "25%", color: "#3b82f6" },
  { key: "co", label: "CO", fullLabel: "Compliance", weight: "20%", color: "#f59e0b" },
  { key: "dq", label: "DQ", fullLabel: "Data Quality", weight: "20%", color: "#8b5cf6" },
];

/* ── NexOP Portfolio Reference Data (from CAM-PORTFOLIO-SAVINGS.md) ── */

const NEXOP_MODULES = [
  { module: "Financial", nexop: 12.22, cams: 8, top: "NexVERIFY (~7.5%)", color: "#10b981" },
  { module: "Estimating", nexop: 3.12, cams: 2, top: "BOM Pricing (~3.0%)", color: "#3b82f6" },
  { module: "Operations", nexop: 1.81, cams: 4, top: "Field Qty (~0.6%)", color: "#f59e0b" },
  { module: "Technology", nexop: 1.51, cams: 3, top: "TUCKS (~1.2%)", color: "#8b5cf6" },
  { module: "Compliance", nexop: 0.60, cams: 2, top: "NexCheck (~0.4%)", color: "#ef4444" },
];

const NEXOP_TIERS = [
  { tier: "$1M", nexop: "9–12%", dollars: "$90K–$120K", perEmployee: "~$30K" },
  { tier: "$5M", nexop: "7–9%", dollars: "$350K–$450K", perEmployee: "~$30K" },
  { tier: "$10M", nexop: "~9%", dollars: "~$890K", perEmployee: "~$36K" },
  { tier: "$50M", nexop: "6–8%", dollars: "$3M–$4M", perEmployee: "~$38K" },
];

const NEXOP_TOTAL = 19.26; // sum of module NexOPs

/* ── Sparkline SVG ── */

function Sparkline({ data, width = 600, height = 100 }: { data: TrendPoint[]; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ fontSize: 11, color: "#9ca3af", padding: 16 }}>Insufficient trend data. Snapshots are computed nightly.</div>;

  const pad = { top: 12, right: 8, bottom: 24, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const vals = data.map(d => d.composite);
  const minVal = Math.max(0, Math.min(...vals) - 5);
  const maxVal = Math.min(100, Math.max(...vals) + 5);
  const range = maxVal - minVal || 1;
  const xStep = data.length > 1 ? w / (data.length - 1) : w;

  const points = data.map((d, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + h - ((d.composite - minVal) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  const areaPath = `M${pad.left},${pad.top + h} L${points.join(" L")} L${pad.left + (data.length - 1) * xStep},${pad.top + h} Z`;

  const labelInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {/* Y-axis markers */}
      {[0, 0.5, 1].map(frac => {
        const y = pad.top + h - frac * h;
        const val = Math.round(minVal + frac * range);
        return (
          <g key={frac}>
            <line x1={pad.left} y1={y} x2={pad.left + w} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{val}%</text>
          </g>
        );
      })}
      <path d={areaPath} fill="#10b981" opacity={0.08} />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth={2} />
      {/* Last dot */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        const x = pad.left + (data.length - 1) * xStep;
        const y = pad.top + h - ((last.composite - minVal) / range) * h;
        return <circle cx={x} cy={y} r={3} fill="#10b981" />;
      })()}
      {/* X labels */}
      {data.map((d, i) =>
        i % labelInterval === 0 ? (
          <text key={d.date} x={pad.left + i * xStep} y={height - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">
            {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ── Score Ring (circular gauge) ── */

function ScoreRing({ value, size = 120, color = "#10b981", label }: { value: number; size?: number; color?: string; label?: string }) {
  const r = (size - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={size > 100 ? 28 : 18} fontWeight={700} fill="#0f172a"
        >
          {value.toFixed(1)}%
        </text>
      </svg>
      {label && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>}
    </div>
  );
}

/* ── Benchmark Bar ── */

function BenchmarkBar({ actual, baseline }: { actual: number; baseline: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: "#6b7280" }}>Industry Baseline: <strong>{baseline}%</strong></span>
        <span style={{ color: "#10b981", fontWeight: 600 }}>Your Score: <strong>{actual.toFixed(1)}%</strong></span>
      </div>
      <div style={{ position: "relative", height: 14, borderRadius: 7, background: "#f3f4f6", overflow: "hidden" }}>
        {/* Baseline marker */}
        <div style={{ position: "absolute", left: `${baseline}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", zIndex: 2 }} />
        {/* Actual bar */}
        <div style={{ height: "100%", width: `${Math.min(actual, 100)}%`, borderRadius: 7, background: "linear-gradient(90deg, #10b981, #059669)", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
        +{(actual - baseline).toFixed(1)} pts above industry average
      </div>
    </div>
  );
}

/* ── Metric Row ── */

function MetricRow({ label, value, suffix = "%", color }: { label: string; value: number; suffix?: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f9fafb" }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 80, height: 5, borderRadius: 3, background: "#f3f4f6", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, borderRadius: 3, background: color || "#10b981", transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", minWidth: 48, textAlign: "right" }}>
          {value.toFixed(1)}{suffix}
        </span>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function NexIntDashboardPage() {
  const [data, setData] = useState<NexIntDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  useEffect(() => {
    if (!token) { setError("Missing access token."); setLoading(false); return; }
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/admin/analytics/nexint`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        const companies = await r.json();
        if (!companies.length) throw new Error("No companies found");
        // Use first company for the dashboard
        const companyId = companies[0].companyId;
        return fetch(`${API_BASE}/admin/analytics/nexint/${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then(async r => {
        if (!r.ok) throw new Error(`Failed to load NexINT (${r.status})`);
        return r.json();
      })
      .then((d: NexIntDashboard) => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSnapshot = async () => {
    if (!token || !data) return;
    setSnapshotting(true);
    try {
      // Get the company ID from the admin endpoint
      const companiesRes = await fetch(`${API_BASE}/admin/analytics/nexint`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const companies = await companiesRes.json();
      if (companies.length > 0) {
        await fetch(`${API_BASE}/admin/analytics/nexint/${companies[0].companyId}/snapshot`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      // Reload
      window.location.reload();
    } catch { /* ignore */ }
    setSnapshotting(false);
  };

  const toggleDim = (key: string) => setExpandedDim(expandedDim === key ? null : key);

  return (
    <PageCard>
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: 20, fontWeight: 700 }}>
            Nexus Impact Dashboard
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            NexOP (Nexus Operating Percentage) measures what Nexus saves. NexINT (Nexus Integrity Index) measures what Nexus corrects.
          </p>
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button
              onClick={handleSnapshot}
              disabled={snapshotting}
              style={{
                padding: "4px 12px", fontSize: 11, borderRadius: 6,
                border: "1px solid #d1d5db", background: "#ffffff", color: "#374151",
                cursor: snapshotting ? "not-allowed" : "pointer", opacity: snapshotting ? 0.5 : 1,
              }}
            >
              {snapshotting ? "Computing…" : "Store Snapshot"}
            </button>
            <a
              href="/system/analytics"
              style={{
                padding: "4px 12px", fontSize: 11, borderRadius: 6,
                border: "1px solid #d1d5db", background: "#ffffff", color: "#3b82f6",
                textDecoration: "none", fontWeight: 500,
              }}
            >
              ← TUCKS Analytics
            </a>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#6b7280" }}>Computing NexINT scores…</div>}
        {error && <div style={{ padding: 20, fontSize: 13, color: "#b91c1c", background: "#fef2f2", borderRadius: 8 }}>{error}</div>}

        {data && !loading && (() => {
          const { current, trend, industryBaseline, delta30d } = data;

          return (
            <>
              {/* ── Dual-Axis Summary ── */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16,
              }}>
                {/* NexOP Card */}
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>NexOP — Financial Recovery</span>
                  </div>
                  <div style={{ padding: "16px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 700, color: "#2563eb" }}>~6–12%</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>of annual revenue recovered</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>20 CAMs (Competitive Advantage Modules) across 5 domains</div>
                  </div>
                </div>

                {/* NexINT Card */}
                <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>NexINT — Operational Integrity</span>
                  </div>
                  <div style={{ padding: "16px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 700, color: "#10b981" }}>{current.composite.toFixed(1)}%</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>composite integrity score (live)</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>Industry baseline: ~{industryBaseline.composite}% → +{(current.composite - industryBaseline.composite).toFixed(0)} pts improvement</div>
                  </div>
                </div>
              </div>

              {/* ── NexOP — Savings by Module ── */}
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>NexOP — Savings by Module</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>Portfolio NexOP: ~{NEXOP_TOTAL.toFixed(2)}% (theoretical max)</span>
                </div>
                <div style={{ padding: "8px 16px 12px" }}>
                  {NEXOP_MODULES.map(m => (
                    <div key={m.module} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f9fafb" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />
                        <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{m.module}</span>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>({m.cams} CAMs)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 100, height: 5, borderRadius: 3, background: "#f3f4f6", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(m.nexop / NEXOP_TOTAL) * 100}%`, borderRadius: 3, background: m.color, transition: "width 0.4s ease" }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", minWidth: 48, textAlign: "right" }}>~{m.nexop.toFixed(2)}%</span>
                        <span style={{ fontSize: 10, color: "#9ca3af", minWidth: 110, textAlign: "right" }}>Top: {m.top}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── NexOP — Impact by Revenue Tier ── */}
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>NexOP — Impact by Revenue Tier</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
                  {NEXOP_TIERS.map((t, i) => (
                    <div key={t.tier} style={{
                      padding: "14px 16px", textAlign: "center",
                      borderRight: i < NEXOP_TIERS.length - 1 ? "1px solid #f3f4f6" : "none",
                    }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{t.tier} Revenue</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{t.nexop}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginTop: 2 }}>{t.dollars}/yr</div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{t.perEmployee}/employee</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── NexINT — Integrity Detail ── */}
              <div style={{
                borderRadius: 12, border: "1px solid #e5e7eb", background: "#ffffff",
                overflow: "hidden", marginBottom: 16,
              }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>NexINT — Dimension Scores (Live)</span>
                </div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                    {/* Main score ring */}
                    <ScoreRing value={current.composite} size={130} color="#10b981" label="NexINT Score" />

                    {/* Delta badge */}
                    {delta30d && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{
                          fontSize: 18, fontWeight: 700,
                          color: delta30d.composite >= 0 ? "#10b981" : "#ef4444",
                        }}>
                          {delta30d.composite >= 0 ? "▲" : "▼"} {Math.abs(delta30d.composite).toFixed(1)} pts
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>30-day change</div>
                      </div>
                    )}

                    {/* Dimension mini rings */}
                    <div style={{ display: "flex", gap: 16, flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
                      {DIMS.map(dim => (
                        <div key={dim.key} style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleDim(dim.key)}>
                          <ScoreRing value={current[dim.key]} size={72} color={dim.color} />
                          <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", marginTop: 2 }}>{dim.label}</div>
                          <div style={{ fontSize: 9, color: "#9ca3af" }}>{dim.weight}</div>
                          {delta30d && (
                            <div style={{ fontSize: 9, color: delta30d[dim.key] >= 0 ? "#10b981" : "#ef4444" }}>
                              {delta30d[dim.key] >= 0 ? "+" : ""}{delta30d[dim.key].toFixed(1)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Benchmark bar */}
                <div style={{ padding: "12px 20px" }}>
                  <BenchmarkBar actual={current.composite} baseline={industryBaseline.composite} />
                </div>
              </div>

              {/* ── Trend Chart ── */}
              <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  NexINT Trend (90 days)
                </div>
                <div style={{ padding: "8px 16px 12px" }}>
                  <Sparkline data={trend} />
                </div>
              </div>

              {/* ── Dimension Drill-Downs ── */}
              {DIMS.map(dim => (
                <div key={dim.key} style={{
                  borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff",
                  overflow: "hidden", marginBottom: 12,
                }}>
                  <div
                    onClick={() => toggleDim(dim.key)}
                    style={{
                      padding: "10px 16px", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "space-between",
                      borderBottom: expandedDim === dim.key ? "1px solid #f3f4f6" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dim.color }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{dim.fullLabel}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>({dim.weight})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: dim.color }}>
                        {current[dim.key].toFixed(1)}%
                      </span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>
                        Baseline: {industryBaseline[dim.key]}%
                      </span>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>
                        {expandedDim === dim.key ? "▾" : "▸"}
                      </span>
                    </div>
                  </div>

                  {expandedDim === dim.key && (
                    <div style={{ padding: "8px 16px 12px" }}>
                      {dim.key === "fi" && (() => {
                        const c = current.components.fi;
                        return (
                          <>
                            <MetricRow label="Receipt Coverage" value={c.receiptCoverage} color={dim.color} />
                            <MetricRow label="Duplicate Detection" value={c.dupDetection} color={dim.color} />
                            <MetricRow label="Pricing Accuracy" value={c.pricingAccuracy} color={dim.color} />
                            <MetricRow label="Reconciliation" value={c.reconciliation} color={dim.color} />
                          </>
                        );
                      })()}
                      {dim.key === "pc" && (() => {
                        const c = current.components.pc;
                        return (
                          <>
                            <MetricRow label="Task Completion Rate" value={c.taskCompletion} color={dim.color} />
                            <MetricRow label="Assessment Assignment" value={c.assessmentAssignment} color={dim.color} />
                            <MetricRow label="Scan Utilization" value={c.scanUtilization} color={dim.color} />
                            <MetricRow label="Median Review Cycle" value={c.reviewCycleHrs} suffix=" hrs" color={dim.color} />
                          </>
                        );
                      })()}
                      {dim.key === "co" && (
                        <div style={{ padding: "8px 0", fontSize: 12, color: "#6b7280" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 14 }}>⏳</span>
                            <span style={{ fontWeight: 600 }}>Stubbed at 85%</span>
                          </div>
                          <div>{current.components.co.note}</div>
                          <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
                            When ComplianceChecklist and UserCertification models are added to the schema,
                            this dimension will compute checklist completion rates, certification currency,
                            and audit readiness from live data.
                          </div>
                        </div>
                      )}
                      {dim.key === "dq" && (() => {
                        const c = current.components.dq;
                        return (
                          <>
                            <MetricRow label="AI Learning Velocity" value={c.aiLearning} color={dim.color} />
                            <MetricRow label="Fleet Consistency" value={c.fleetConsistency} color={dim.color} />
                            <MetricRow label="Assessment Confidence" value={c.assessmentConfidence} color={dim.color} />
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}

              {/* ── Formula Reference ── */}
              <div style={{
                borderRadius: 10, border: "1px solid #e5e7eb", background: "#fafbfc",
                padding: "12px 16px", marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Formulas
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", marginBottom: 4 }}>
                  NexINT = (FI × 0.35) + (PC × 0.25) + (CO × 0.20) + (DQ × 0.20)
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", marginBottom: 6 }}>
                  NexOP = Σ (Module NexOP contributions) scaled by revenue tier
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>
                  NexINT snapshots stored nightly at 3:00 AM UTC. Integrity scores computed live. NexOP figures from validated CAM portfolio models.
                </div>
              </div>

              {/* ── The Two-Sentence Pitch ── */}
              <div style={{
                borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a",
                padding: "16px 20px", marginBottom: 16, color: "#ffffff",
              }}>
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  <strong style={{ color: "#60a5fa" }}>NexOP:</strong>{" "}
                  <em>&ldquo;Nexus recovers 6–12% of your annual revenue through automation, accuracy, and waste elimination.&rdquo;</em>
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong style={{ color: "#34d399" }}>NexINT:</strong>{" "}
                  <em>&ldquo;The average contractor operates at ~72% integrity. Nexus brings you to {current.composite.toFixed(0)}% — because the system makes it structurally impossible to operate sloppily.&rdquo;</em>
                </div>
              </div>

              {/* Footer */}
              <div style={{ fontSize: 10, color: "#d1d5db", display: "flex", justifyContent: "space-between" }}>
                <span>Nexus Impact Dashboard · TECH-VIS-0001 (NexOP) + TECH-VIS-0002 (NexINT)</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
            </>
          );
        })()}
      </div>
    </PageCard>
  );
}
