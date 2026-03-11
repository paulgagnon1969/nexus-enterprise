"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CamScores {
  uniqueness: number;
  value: number;
  demonstrable: number;
  defensible: number;
  total: number;
}

interface CamEntry {
  camId: string;
  code: string;
  title: string;
  category: string;
  scores: CamScores;
  status: string;
  systemDocumentId?: string;
}

interface CamModule {
  mode: string;
  modeLabel: string;
  camCount: number;
  aggregateScore: number;
  cams: CamEntry[];
}

interface CamManualData {
  modules: CamModule[];
  totalCams: number;
  overallAvgScore: number;
}

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

const MODE_ICONS: Record<string, string> = {
  EST: "💰",
  FIN: "📊",
  OPS: "🏗️",
  HR: "👷",
  CLT: "🤝",
  CMP: "✅",
  TECH: "⚡",
};

function scoreColor(score: number): string {
  if (score >= 30) return "#059669"; // green
  if (score >= 25) return "#0284c7"; // blue
  if (score >= 20) return "#b45309"; // amber
  return "#6b7280"; // gray
}

function scoreBg(score: number): string {
  if (score >= 30) return "#ecfdf5";
  if (score >= 25) return "#f0f9ff";
  if (score >= 20) return "#fffbeb";
  return "#f9fafb";
}

export default function CamManualPage() {
  const [data, setData] = useState<CamManualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Invite / vouch state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ shareUrl: string; recipientEmail: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleInviteSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteEmail.trim()) return;
      setInviteSubmitting(true);
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`${API_BASE}/nexfit/vouch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipientEmail: inviteEmail.trim(),
            recipientName: inviteName.trim() || undefined,
            message: inviteMessage.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to create invite");
        const data = await res.json();
        setInviteResult({ shareUrl: data.shareUrl, recipientEmail: data.recipientEmail });
      } catch (err: any) {
        alert(err.message || "Failed to send invite");
      } finally {
        setInviteSubmitting(false);
      }
    },
    [inviteEmail, inviteName, inviteMessage],
  );

  const handleCopyUrl = useCallback(() => {
    if (!inviteResult) return;
    navigator.clipboard.writeText(inviteResult.shareUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }, [inviteResult]);

  const resetInvite = useCallback(() => {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteName("");
    setInviteMessage("");
    setInviteResult(null);
    setInviteCopied(false);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/admin/sops/cam-manual`, {
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

  const toggleModule = (mode: string) => {
    const next = new Set(expandedModules);
    if (next.has(mode)) {
      next.delete(mode);
    } else {
      next.add(mode);
    }
    setExpandedModules(next);
  };

  const expandAll = () => {
    if (!data) return;
    setExpandedModules(new Set(data.modules.map((m) => m.mode)));
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>🏆 CAM System Manual</h1>
          <p style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
            Competitive Advantage Modules grouped by functional area, sorted by aggregate score.
          </p>
        </div>
        <Link
          href="/system/documents"
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            textDecoration: "none",
            color: "#374151",
            fontSize: 13,
          }}
        >
          ← Back to Documents
        </Link>
      </div>

      {/* Summary Stats */}
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard label="Total CAMs" value={data.totalCams} />
          <StatCard label="Module Groups" value={data.modules.length} />
          <StatCard label="Avg Score" value={data.overallAvgScore} suffix="/40" />
          <StatCard
            label="Top Module"
            value={data.modules[0]?.modeLabel ?? "—"}
            subValue={data.modules[0] ? `${data.modules[0].aggregateScore}/40` : ""}
          />
        </div>
      )}

      {/* Controls */}
      {data && data.modules.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={expandAll} style={btnStyle}>
            Expand All
          </button>
          <button onClick={collapseAll} style={btnStyle}>
            Collapse All
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setInviteOpen(true)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #059669",
              background: "#ecfdf5",
              color: "#059669",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginRight: 8,
            }}
          >
            🤝 Invite Someone
          </button>
          <Link
            href="/system/documents/cam-manual/handbook"
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "white",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📖 Print Handbook
          </Link>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading CAM data...</div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginBottom: 20, padding: 12, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.totalCams === 0 && (
        <div style={{ padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 8, border: "1px dashed #d1d5db" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>No CAMs Found</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Place CAM markdown files in <code>docs/cams/</code> to see them here.
          </div>
        </div>
      )}

      {/* Module Groups */}
      {!loading &&
        data?.modules.map((mod) => {
          const isExpanded = expandedModules.has(mod.mode);
          const icon = MODE_ICONS[mod.mode] || "📦";

          return (
            <div
              key={mod.mode}
              style={{
                marginBottom: 16,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                overflow: "hidden",
              }}
            >
              {/* Module Header - Clickable */}
              <button
                onClick={() => toggleModule(mod.mode)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: scoreBg(mod.aggregateScore),
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{mod.modeLabel}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · <code style={{ fontSize: 11 }}>{mod.mode}</code>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      background: "#ffffff",
                      border: `1px solid ${scoreColor(mod.aggregateScore)}`,
                      color: scoreColor(mod.aggregateScore),
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {mod.aggregateScore}/40 avg
                  </div>
                  <span style={{ fontSize: 14, color: "#6b7280" }}>{isExpanded ? "▼" : "▶"}</span>
                </div>
              </button>

              {/* CAMs List */}
              {isExpanded && (
                <div style={{ background: "#ffffff" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>CAM ID</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Title</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 90 }}>Category</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 50 }}>U</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 50 }}>V</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 50 }}>D</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 50 }}>Df</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 60, fontWeight: 700 }}>Total</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 70 }}>Status</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e5e7eb", width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mod.cams.map((cam) => (
                        <tr key={cam.code}>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", fontFamily: "monospace", fontSize: 11 }}>
                            {cam.camId}
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", fontWeight: 500 }}>
                            {cam.title}
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "#f3f4f6",
                                fontSize: 10,
                                fontWeight: 500,
                              }}
                            >
                              {CATEGORY_LABELS[cam.category] || cam.category}
                            </span>
                          </td>
                          <td style={{ ...scoreCellStyle, borderBottom: "1px solid #f3f4f6" }}>{cam.scores.uniqueness}</td>
                          <td style={{ ...scoreCellStyle, borderBottom: "1px solid #f3f4f6" }}>{cam.scores.value}</td>
                          <td style={{ ...scoreCellStyle, borderBottom: "1px solid #f3f4f6" }}>{cam.scores.demonstrable}</td>
                          <td style={{ ...scoreCellStyle, borderBottom: "1px solid #f3f4f6" }}>{cam.scores.defensible}</td>
                          <td
                            style={{
                              padding: "8px 12px",
                              textAlign: "center",
                              borderBottom: "1px solid #f3f4f6",
                              fontWeight: 700,
                              color: scoreColor(cam.scores.total),
                            }}
                          >
                            {cam.scores.total}
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 500,
                                background: cam.status === "published" ? "#dcfce7" : cam.status === "validated" ? "#dbeafe" : "#f3f4f6",
                                color: cam.status === "published" ? "#166534" : cam.status === "validated" ? "#1d4ed8" : "#6b7280",
                              }}
                            >
                              {cam.status}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>
                            {cam.systemDocumentId && (
                              <Link
                                href={`/system/documents/${cam.systemDocumentId}`}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  border: "1px solid #2563eb",
                                  background: "#eff6ff",
                                  color: "#2563eb",
                                  fontSize: 10,
                                  textDecoration: "none",
                                }}
                              >
                                View
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

      {/* Invite Modal */}
      {inviteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) resetInvite(); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 24,
              width: 440,
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            {!inviteResult ? (
              <>
                <h3 style={{ margin: 0, fontSize: 16, marginBottom: 4 }}>🤝 Invite Someone to View the CAM Manual</h3>
                <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                  They&apos;ll need to accept the CNDA+ and complete a brief questionnaire before viewing.
                </p>
                <form onSubmit={handleInviteSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Recipient Email *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      placeholder="recipient@company.com"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Recipient Name</label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Jane Smith"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Personal Message (optional)</label>
                    <textarea
                      value={inviteMessage}
                      onChange={(e) => setInviteMessage(e.target.value)}
                      placeholder="Hey, check out this document..."
                      rows={2}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={resetInvite} style={{ ...btnStyle, padding: "8px 16px" }}>Cancel</button>
                    <button
                      type="submit"
                      disabled={!inviteEmail.trim() || inviteSubmitting}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 6,
                        border: "none",
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: !inviteEmail.trim() ? 0.5 : 1,
                      }}
                    >
                      {inviteSubmitting ? "Creating..." : "Generate Invite Link"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>✅ Invite Created!</h3>
                <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 16 }}>
                  Share this link with <strong>{inviteResult.recipientEmail}</strong>. They&apos;ll need to accept the CNDA+ and complete a questionnaire.
                </p>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#f1f5f9",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    wordBreak: "break-all",
                    marginBottom: 16,
                    fontFamily: "monospace",
                  }}
                >
                  {inviteResult.shareUrl}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={resetInvite} style={{ ...btnStyle, padding: "8px 16px" }}>Close</button>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 6,
                      border: "none",
                      background: inviteCopied ? "#059669" : "#2563eb",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {inviteCopied ? "✓ Copied!" : "Copy Link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Score Legend */}
      {!loading && data && data.totalCams > 0 && (
        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: "#f0f9ff",
            borderRadius: 8,
            border: "1px solid #bae6fd",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#0c4a6e" }}>📖 Score Guide</div>
          <div style={{ fontSize: 13, color: "#0369a1", lineHeight: 1.8 }}>
            <strong>U</strong> = Uniqueness · <strong>V</strong> = Value · <strong>D</strong> = Demonstrable · <strong>Df</strong> = Defensible
            <br />
            Each scored 1-10. <strong>Total</strong> = sum of all four (max 40).
            <br />
            <strong>Aggregate Score</strong> = average of CAM totals within a module group.
            <br />
            Module groups are sorted by aggregate score (highest first).
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  fontSize: 12,
  cursor: "pointer",
};

const scoreCellStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "center",
  fontSize: 12,
  color: "#374151",
};

function StatCard({ label, value, suffix, subValue }: { label: string; value: string | number; suffix?: string; subValue?: string }) {
  return (
    <div
      style={{
        padding: 14,
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>
        {value}
        {suffix && <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>{suffix}</span>}
      </div>
      {subValue && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{subValue}</div>}
    </div>
  );
}
