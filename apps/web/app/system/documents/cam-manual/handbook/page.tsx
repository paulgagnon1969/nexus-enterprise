"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import DOMPurify from "dompurify";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CamScores {
  uniqueness: number;
  value: number;
  demonstrable: number;
  defensible: number;
  total: number;
}

interface HandbookCam {
  camId: string;
  code: string;
  title: string;
  category: string;
  scores: CamScores;
  status: string;
  htmlContent: string;
}

interface HandbookModule {
  mode: string;
  modeLabel: string;
  camCount: number;
  aggregateScore: number;
  cams: HandbookCam[];
}

interface HandbookData {
  modules: HandbookModule[];
  totalCams: number;
  overallAvgScore: number;
}

const MODE_ICONS: Record<string, string> = {
  EST: "💰",
  FIN: "📊",
  OPS: "🏗️",
  HR: "👷",
  CLT: "🤝",
  CMP: "✅",
  TECH: "⚡",
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTO: "Automation",
  INTL: "Intelligence",
  INTG: "Integration",
  VIS: "Visibility",
  SPD: "Speed",
  ACC: "Accuracy",
  CMP: "Compliance",
  COLLAB: "Collaboration",
};

function scoreTier(score: number): string {
  if (score >= 35) return "🏆 Elite";
  if (score >= 30) return "⭐ Strong";
  if (score >= 24) return "✅ Qualified";
  return "—";
}

function scoreColor(score: number): string {
  if (score >= 35) return "#059669";
  if (score >= 30) return "#0284c7";
  if (score >= 24) return "#b45309";
  return "#6b7280";
}

function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["div", "pre", "code", "br", "span"],
    ADD_ATTR: ["class", "style", "id"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

export default function CamHandbookPage() {
  const [data, setData] = useState<HandbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/admin/sops/cam-handbook-html`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading handbook...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 16 }}>{error}</div>
        <Link href="/system/documents/cam-manual" style={{ color: "#2563eb" }}>← Back to CAM Manual</Link>
      </div>
    );
  }

  if (!data || data.totalCams === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div>No CAMs found.</div>
        <Link href="/system/documents/cam-manual" style={{ color: "#2563eb" }}>← Back</Link>
      </div>
    );
  }

  // Build a flat section index for the TOC
  let sectionCounter = 0;

  // ── Aggregate computations for Executive Summary ──
  const allCams = data.modules.flatMap(m => m.cams);

  // Tier distribution
  const eliteCount = allCams.filter(c => c.scores.total >= 35).length;
  const strongCount = allCams.filter(c => c.scores.total >= 30 && c.scores.total < 35).length;
  const qualifiedCount = allCams.filter(c => c.scores.total >= 24 && c.scores.total < 30).length;

  // Average score dimensions
  const avgU = +(allCams.reduce((s, c) => s + c.scores.uniqueness, 0) / allCams.length).toFixed(1);
  const avgV = +(allCams.reduce((s, c) => s + c.scores.value, 0) / allCams.length).toFixed(1);
  const avgD = +(allCams.reduce((s, c) => s + c.scores.demonstrable, 0) / allCams.length).toFixed(1);
  const avgDf = +(allCams.reduce((s, c) => s + c.scores.defensible, 0) / allCams.length).toFixed(1);

  // Category counts
  const categoryCounts: Record<string, number> = {};
  allCams.forEach(c => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  });
  const maxCatCount = Math.max(...Object.values(categoryCounts), 1);

  // Overall tier
  const totalScore = data.overallAvgScore;
  const overallTierLabel = totalScore >= 35 ? "Elite" : totalScore >= 30 ? "Strong" : totalScore >= 24 ? "Qualified" : "—";
  const overallTierIcon = totalScore >= 35 ? "🏆" : totalScore >= 30 ? "⭐" : totalScore >= 24 ? "✅" : "";
  const overallTierColor = totalScore >= 35 ? "#059669" : totalScore >= 30 ? "#0284c7" : totalScore >= 24 ? "#b45309" : "#6b7280";

  // Ring math: circumference of r=64 circle
  const RING_C = 2 * Math.PI * 64; // ~402.12
  const ringFilled = (totalScore / 40) * RING_C;

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .handbook-container { padding: 0 !important; max-width: 100% !important; }
          .cam-section { page-break-inside: avoid; }
          .chapter-header { page-break-before: always; }
          .chapter-header:first-of-type { page-break-before: avoid; }
          .toc-section { page-break-after: always; }
          body { font-size: 11pt; line-height: 1.5; }
          h1 { font-size: 22pt; }
          h2 { font-size: 16pt; }
          h3 { font-size: 13pt; }
          table { font-size: 9pt; }
          .score-guide { page-break-inside: avoid; }
        }
        .cam-content h1 { font-size: 20px; margin: 16px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .cam-content h2 { font-size: 17px; margin: 14px 0 6px; color: #1e293b; }
        .cam-content h3 { font-size: 14px; margin: 12px 0 4px; color: #334155; }
        .cam-content p { margin: 6px 0; line-height: 1.6; }
        .cam-content ul, .cam-content ol { margin: 6px 0; padding-left: 24px; }
        .cam-content li { margin: 3px 0; line-height: 1.5; }
        /* Table styles (th, td, alternating rows) are in globals.css under .cam-content */
        .cam-content pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 12px; }
        .cam-content code { font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
        .cam-content pre code { background: none; padding: 0; }
        .cam-content blockquote { border-left: 3px solid #3b82f6; margin: 8px 0; padding: 8px 16px; background: #f0f9ff; color: #1e40af; font-style: italic; }
        .cam-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
      `}</style>

      {/* Toolbar — hidden when printing */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/system/documents/cam-manual" style={{ color: "#2563eb", fontSize: 13, textDecoration: "none" }}>← Back to CAM Manual</Link>
          <span style={{ color: "#d1d5db" }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>📖 CAM Handbook — Print View</span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{data.totalCams} CAMs · {data.modules.length} modules</span>
        </div>
        <button
          onClick={handlePrint}
          style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#2563eb", color: "white", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
        >
          🖨️ Print / Save PDF
        </button>
      </div>

      {/* Handbook Content */}
      <div ref={printRef} className="handbook-container" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, -apple-system, sans-serif" }}>

        {/* ── Title Page ── */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>NEXUS SYSTEM NCC</h1>
          <h2 style={{ fontSize: 18, fontWeight: 400, color: "#475569", margin: 0 }}>Competitive Advantage Manual (CAM)</h2>
          <div style={{ marginTop: 16, fontSize: 14, color: "#6b7280" }}>
            <strong>{data.totalCams}</strong> documented competitive advantages across <strong>{data.modules.length}</strong> module groups
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "0 0 32px" }} />

        {/* ── Executive Summary Dashboard ── */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: "#0f172a", textAlign: "center" }}>
            Executive Summary
          </h2>

          {/* Row 1: Score Ring + Module Strength Bars */}
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start", marginBottom: 28 }}>
            {/* Overall Package Score Ring */}
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="64" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="64" fill="none" stroke={overallTierColor} strokeWidth="12"
                  strokeDasharray={`${ringFilled} ${RING_C - ringFilled}`}
                  strokeLinecap="round" transform="rotate(-90 80 80)"
                />
                <text x="80" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="#0f172a">
                  {totalScore.toFixed(1)}
                </text>
                <text x="80" y="88" textAnchor="middle" fontSize="12" fill="#6b7280">/40 avg</text>
                <text x="80" y="112" textAnchor="middle" fontSize="13" fontWeight="600" fill={overallTierColor}>
                  {overallTierIcon} {overallTierLabel}
                </text>
              </svg>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Package Score</div>
            </div>

            {/* Module Strength Bars */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#0f172a" }}>Module Strength</div>
              {data.modules.map(mod => {
                const pct = (mod.aggregateScore / 40) * 100;
                const barColor = mod.aggregateScore >= 35 ? "#059669" : mod.aggregateScore >= 30 ? "#0284c7" : mod.aggregateScore >= 24 ? "#b45309" : "#6b7280";
                return (
                  <div key={mod.mode} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 24, textAlign: "center", fontSize: 16 }}>{MODE_ICONS[mod.mode] || "📦"}</span>
                    <span style={{ width: 100, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mod.modeLabel}
                    </span>
                    <div style={{ flex: 1, height: 16, background: "#f3f4f6", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 8 }} />
                    </div>
                    <span style={{ width: 48, textAlign: "right", fontSize: 12, fontWeight: 600, color: barColor }}>
                      {mod.aggregateScore}/40
                    </span>
                    <span style={{ width: 28, fontSize: 11, color: "#6b7280", textAlign: "right" }}>({mod.camCount})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 2: Tier Distribution */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[
              { label: "Elite", icon: "🏆", count: eliteCount, range: "35–40", color: "#059669", bg: "#ecfdf5" },
              { label: "Strong", icon: "⭐", count: strongCount, range: "30–34", color: "#0284c7", bg: "#f0f9ff" },
              { label: "Qualified", icon: "✅", count: qualifiedCount, range: "24–29", color: "#b45309", bg: "#fffbeb" },
            ].map(tier => (
              <div key={tier.label} style={{
                textAlign: "center", padding: "14px 28px", borderRadius: 10,
                background: tier.bg, border: `1px solid ${tier.color}22`, minWidth: 140,
              }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: tier.color }}>{tier.count}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: tier.color }}>{tier.icon} {tier.label}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>score {tier.range}</div>
              </div>
            ))}
          </div>

          {/* Row 3: Score Dimensions Radar + Category Coverage */}
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
            {/* Radar Chart */}
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Score Dimensions</div>
              <svg width="200" height="200" viewBox="0 0 200 200">
                {/* Grid diamonds */}
                {[0.25, 0.5, 0.75, 1].map(p => (
                  <polygon
                    key={p}
                    points={`100,${100 - 80 * p} ${100 + 80 * p},100 100,${100 + 80 * p} ${100 - 80 * p},100`}
                    fill="none" stroke="#e5e7eb" strokeWidth="0.75"
                  />
                ))}
                {/* Axes */}
                <line x1="100" y1="20" x2="100" y2="180" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="20" y1="100" x2="180" y2="100" stroke="#e5e7eb" strokeWidth="0.5" />
                {/* Data polygon */}
                <polygon
                  points={`100,${100 - avgU * 8} ${100 + avgV * 8},100 100,${100 + avgD * 8} ${100 - avgDf * 8},100`}
                  fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="2"
                />
                {/* Data dots */}
                <circle cx={100} cy={100 - avgU * 8} r="4" fill="#2563eb" />
                <circle cx={100 + avgV * 8} cy={100} r="4" fill="#2563eb" />
                <circle cx={100} cy={100 + avgD * 8} r="4" fill="#2563eb" />
                <circle cx={100 - avgDf * 8} cy={100} r="4" fill="#2563eb" />
                {/* Labels */}
                <text x="100" y="12" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">U {avgU}</text>
                <text x="192" y="104" textAnchor="end" fontSize="11" fontWeight="600" fill="#0f172a">V {avgV}</text>
                <text x="100" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">D {avgD}</text>
                <text x="8" y="104" textAnchor="start" fontSize="11" fontWeight="600" fill="#0f172a">Df {avgDf}</text>
              </svg>
              <div style={{ fontSize: 10, color: "#6b7280" }}>Avg across {allCams.length} CAMs (max 10/axis)</div>
            </div>

            {/* Category Coverage */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#0f172a" }}>Category Coverage</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {Object.entries(CATEGORY_LABELS)
                  .filter(([key]) => (categoryCounts[key] || 0) > 0)
                  .sort((a, b) => (categoryCounts[b[0]] || 0) - (categoryCounts[a[0]] || 0))
                  .map(([key, label]) => {
                    const count = categoryCounts[key] || 0;
                    return (
                      <div key={key} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: 6,
                        background: "#f9fafb", border: "1px solid #f3f4f6",
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#1e293b" }}>{label}</div>
                          <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${(count / maxCatCount) * 100}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", minWidth: 24, textAlign: "right" }}>{count}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Score Guide ── */}
        <div className="score-guide" style={{ marginBottom: 32, padding: 20, background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#0c4a6e" }}>📖 Score Guide</h3>
          <div style={{ fontSize: 13, color: "#0369a1", lineHeight: 1.8 }}>
            Each CAM is scored on four criteria (1–10 each, max 40):
            <br /><strong>U</strong> = Uniqueness · <strong>V</strong> = Value · <strong>D</strong> = Demonstrable · <strong>Df</strong> = Defensible
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#0369a1" }}>
            <strong>Tiers:</strong>{" "}
            🏆 Elite (35–40) · ⭐ Strong (30–34) · ✅ Qualified (24–29)
          </div>
        </div>

        {/* ── Table of Contents ── */}
        <div className="toc-section">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#0f172a" }}>Table of Contents</h2>
          {data.modules.map((mod) => {
            const icon = MODE_ICONS[mod.mode] || "📦";
            return (
              <div key={mod.mode} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{mod.modeLabel}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    ({mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · avg {mod.aggregateScore}/40)
                  </span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginLeft: 28 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280" }}>CAM ID</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280" }}>Title</th>
                      <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 600, color: "#6b7280", width: 50 }}>Score</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280", width: 80 }}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mod.cams.map((cam) => (
                      <tr key={cam.code} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11 }}>
                          <a href={`#cam-${cam.code}`} style={{ color: "#2563eb", textDecoration: "none" }}>{cam.camId}</a>
                        </td>
                        <td style={{ padding: "4px 8px" }}>{cam.title}</td>
                        <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, color: scoreColor(cam.scores.total) }}>
                          {cam.scores.total}
                        </td>
                        <td style={{ padding: "4px 8px", fontSize: 11 }}>
                          {CATEGORY_LABELS[cam.category] || cam.category}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* ── Full CAM Documents ── */}
        {data.modules.map((mod, modIdx) => {
          const icon = MODE_ICONS[mod.mode] || "📦";
          return (
            <div key={mod.mode}>
              {/* Chapter Header */}
              <div className="chapter-header" style={{ marginTop: modIdx === 0 ? 0 : 32, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 24 }}>{icon}</span>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                    {mod.modeLabel}
                  </h2>
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginLeft: 34 }}>
                  {mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · avg score {mod.aggregateScore}/40
                </div>
                <hr style={{ border: "none", borderTop: "2px solid #e5e7eb", margin: "12px 0 0" }} />
              </div>

              {/* Individual CAM Documents */}
              {mod.cams.map((cam) => {
                sectionCounter++;
                return (
                  <div key={cam.code} id={`cam-${cam.code}`} className="cam-section" style={{ marginBottom: 40 }}>
                    {/* CAM Header */}
                    <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", marginBottom: 2 }}>
                            Section {sectionCounter} · {cam.camId}
                          </div>
                          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1e293b" }}>
                            {cam.title}
                          </h3>
                        </div>
                        <div style={{
                          padding: "4px 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          color: scoreColor(cam.scores.total),
                          border: `1px solid ${scoreColor(cam.scores.total)}`,
                          whiteSpace: "nowrap",
                        }}>
                          {cam.scores.total}/40 {scoreTier(cam.scores.total)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        U:{cam.scores.uniqueness} · V:{cam.scores.value} · D:{cam.scores.demonstrable} · Df:{cam.scores.defensible}
                        {" · "}
                        {CATEGORY_LABELS[cam.category] || cam.category}
                      </div>
                    </div>

                    {/* CAM Content */}
                    <div
                      className="cam-content"
                      style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b" }}
                      dangerouslySetInnerHTML={{ __html: sanitize(cam.htmlContent) }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Footer */}
        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "48px 0 16px" }} />
        <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
          NEXUS SYSTEM NCC — Competitive Advantage Manual · {data.totalCams} CAMs · {data.modules.length} Module Groups ·{" "}
          Generated {new Date().toISOString().split("T")[0]}
        </div>
      </div>
    </>
  );
}
