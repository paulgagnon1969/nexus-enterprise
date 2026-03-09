"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────────

interface PrecisionScan {
  id: string;
  name: string | null;
  status: string;
  imageCount: number;
  detailLevel: string;
  usdzUrl: string | null;
  objUrl: string | null;
  glbUrl: string | null;
  skpUrl: string | null;
  analysis: { dimensions?: { length: number; width: number; height: number; unit: string } } | null;
  processingMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { images: number };
}

interface VideoAssessment {
  id: string;
  projectId: string | null;
  status: string;
  sourceType: string;
  videoFileName: string | null;
  frameCount: number | null;
  confidenceScore: number | null;
  captureDate: string | null;
  notes: string | null;
  createdAt: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  findings?: { id: string; zone: string; category: string; severity: string }[];
  _count?: { findings: number };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

const SCAN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:        { label: "Queued",          color: "#64748B", bg: "#F1F5F9" },
  DOWNLOADING:    { label: "Downloading",     color: "#0891B2", bg: "#ECFEFF" },
  RECONSTRUCTING: { label: "Reconstructing",  color: "#D97706", bg: "#FFFBEB" },
  CONVERTING:     { label: "Converting",      color: "#7C3AED", bg: "#F5F3FF" },
  ANALYZING:      { label: "Analyzing",       color: "#2563EB", bg: "#EFF6FF" },
  UPLOADING:      { label: "Uploading",       color: "#0891B2", bg: "#ECFEFF" },
  COMPLETED:      { label: "Complete",        color: "#059669", bg: "#ECFDF5" },
  FAILED:         { label: "Failed",          color: "#DC2626", bg: "#FEF2F2" },
};

const ASSESS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PROCESSING: { label: "Processing", color: "#D97706", bg: "#FFFBEB" },
  COMPLETE:   { label: "Complete",   color: "#059669", bg: "#ECFDF5" },
  REVIEWED:   { label: "Reviewed",   color: "#2563EB", bg: "#EFF6FF" },
  FAILED:     { label: "Failed",     color: "#DC2626", bg: "#FEF2F2" },
};

function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; color: string; bg: string }> }) {
  const s = config[status] ?? { label: status, color: "#64748B", bg: "#F1F5F9" };
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: 999, color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDimensions(a: PrecisionScan["analysis"]) {
  if (!a?.dimensions) return null;
  const d = a.dimensions;
  const fmt = (v: number) => (v * (d.unit === "meters" ? 39.3701 : 1)).toFixed(1);
  return `${fmt(d.length)} × ${fmt(d.width)} × ${fmt(d.height)} in`;
}

// ── Component ───────────────────────────────────────────────────────────

interface ScansTabProps {
  projectId: string;
}

export default function ScansTab({ projectId }: ScansTabProps) {
  const [scans, setScans] = useState<PrecisionScan[]>([]);
  const [assessments, setAssessments] = useState<VideoAssessment[]>([]);
  const [unassigned, setUnassigned] = useState<VideoAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [scanData, assessData] = await Promise.all([
        apiFetch<PrecisionScan[]>(`/precision-scans?projectId=${projectId}`),
        apiFetch<{ items: VideoAssessment[]; total: number } | VideoAssessment[]>(
          `/video-assessment?projectId=${projectId}`
        ),
      ]);
      setScans(scanData);
      setAssessments(Array.isArray(assessData) ? assessData : assessData.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const loadUnassigned = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: VideoAssessment[]; total: number } | VideoAssessment[]>(
        `/video-assessment?unassigned=true`
      );
      setUnassigned(Array.isArray(data) ? data : data.items ?? []);
    } catch { /* ignore */ }
  }, []);

  const handleAssign = async (assessmentId: string) => {
    setAssigning(assessmentId);
    try {
      await apiFetch(`/video-assessment/${assessmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      });
      await load();
      setUnassigned(prev => prev.filter(a => a.id !== assessmentId));
    } catch { /* ignore */ } finally {
      setAssigning(null);
    }
  };

  const scanCount = scans.length;
  const assessCount = assessments.length;

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Scans & Assessments</h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
            {scanCount} precision scan{scanCount !== 1 ? "s" : ""} · {assessCount} video assessment{assessCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAssignPanel(v => !v); if (!showAssignPanel) void loadUnassigned(); }}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid #2563eb",
            background: showAssignPanel ? "#2563eb" : "#eff6ff",
            color: showAssignPanel ? "#fff" : "#1d4ed8",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          {showAssignPanel ? "Close" : "Assign Assessment"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 6, background: "#fef2f2", color: "#DC2626", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: "#6b7280", padding: 16 }}>Loading…</div>
      )}

      {/* Assign panel */}
      {showAssignPanel && (
        <div style={{
          marginBottom: 16, padding: 12, borderRadius: 8,
          border: "1px solid #dbeafe", background: "#f0f9ff",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#1e40af" }}>
            Unassigned Assessments
          </div>
          {unassigned.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No unassigned assessments.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unassigned.map(a => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderRadius: 6, background: "#fff", border: "1px solid #e5e7eb",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {a.videoFileName || `Assessment ${a.id.slice(0, 8)}`}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      {formatDate(a.createdAt)} · {a.sourceType}
                      {a._count?.findings ? ` · ${a._count.findings} findings` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={assigning === a.id}
                    onClick={() => handleAssign(a.id)}
                    style={{
                      padding: "4px 10px", borderRadius: 4, border: "none",
                      background: "#2563eb", color: "#fff", fontSize: 11,
                      fontWeight: 600, cursor: assigning === a.id ? "wait" : "pointer",
                      opacity: assigning === a.id ? 0.6 : 1,
                    }}
                  >
                    {assigning === a.id ? "Assigning…" : "Assign"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Precision Scans section */}
      {!loading && (
        <>
          <SectionHeader icon="📐" title="Precision Scans" count={scanCount} />
          {scanCount === 0 ? (
            <EmptyState text="No precision scans linked to this project. Start a scan from the mobile app." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {scans.map(s => (
                <div key={s.id} style={{
                  padding: "12px 14px", borderRadius: 8,
                  border: "1px solid #e5e7eb", background: "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {s.name || `Scan ${s.id.slice(0, 8)}`}
                    </div>
                    <StatusBadge status={s.status} config={SCAN_STATUS} />
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>{s._count?.images ?? s.imageCount} images</span>
                    <span>{formatDate(s.createdAt)}</span>
                    {s.createdBy && <span>{s.createdBy.firstName} {s.createdBy.lastName}</span>}
                    {formatDimensions(s.analysis) && <span>{formatDimensions(s.analysis)}</span>}
                    {s.processingMs && <span>{(s.processingMs / 1000).toFixed(0)}s processing</span>}
                  </div>
                  {s.status === "COMPLETED" && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { url: s.skpUrl, label: "SKP" },
                        { url: s.objUrl, label: "OBJ" },
                        { url: s.glbUrl, label: "GLB" },
                        { url: s.usdzUrl, label: "USDZ" },
                      ].filter(f => f.url).map(f => (
                        <a key={f.label} href={f.url!} target="_blank" rel="noreferrer" style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                          background: "#f1f5f9", color: "#334155", textDecoration: "none",
                          border: "1px solid #e2e8f0",
                        }}>
                          {f.label}
                        </a>
                      ))}
                    </div>
                  )}
                  {s.status === "FAILED" && s.error && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#DC2626" }}>{s.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Video Assessments section */}
          <SectionHeader icon="📹" title="NexBRIDGE Assessments" count={assessCount} />
          {assessCount === 0 ? (
            <EmptyState text="No video assessments linked to this project. Use the Assign button above or create one from NexBRIDGE Connect." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {assessments.map(a => (
                <div key={a.id} style={{
                  padding: "12px 14px", borderRadius: 8,
                  border: "1px solid #e5e7eb", background: "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {a.videoFileName || `Assessment ${a.id.slice(0, 8)}`}
                    </div>
                    <StatusBadge status={a.status} config={ASSESS_STATUS} />
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>{a.sourceType}</span>
                    <span>{formatDate(a.createdAt)}</span>
                    {a.createdBy && <span>{a.createdBy.firstName} {a.createdBy.lastName}</span>}
                    {a.frameCount && <span>{a.frameCount} frames</span>}
                    {a._count?.findings != null && <span>{a._count.findings} findings</span>}
                    {a.confidenceScore != null && (
                      <span>Confidence: {(a.confidenceScore * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  {a.notes && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563", fontStyle: "italic" }}>
                      {a.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: string; title: string; count: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
      borderBottom: "1px solid #e5e7eb", paddingBottom: 6,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 999,
        background: "#f1f5f9", color: "#64748b",
      }}>
        {count}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 20, textAlign: "center", borderRadius: 8,
      border: "1px dashed #d1d5db", background: "#fafafa", marginBottom: 20,
      fontSize: 13, color: "#6b7280",
    }}>
      {text}
    </div>
  );
}
