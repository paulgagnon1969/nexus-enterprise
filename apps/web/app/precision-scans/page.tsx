"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────

interface PrecisionScan {
  id: string;
  name: string | null;
  status: string;
  imageCount: number;
  detailLevel: string;
  meshJobId: string | null;
  usdzUrl: string | null;
  objUrl: string | null;
  daeUrl: string | null;
  stlUrl: string | null;
  gltfUrl: string | null;
  glbUrl: string | null;
  stepUrl: string | null;
  skpUrl: string | null;
  analysis: ScanAnalysis | null;
  processingMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  project?: { id: string; name: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  images?: { id: string; url: string; fileName: string }[];
  _count?: { images: number };
}

interface ScanAnalysis {
  dimensions?: { length: number; width: number; height: number; unit: string };
  vertexCount?: number;
  faceCount?: number;
  dominantPlanes?: number;
  surfaceArea?: number;
}

type View = "list" | "detail";

// ── Helpers ────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:        { label: "Queued",          color: "#64748B", bg: "#F1F5F9" },
  DOWNLOADING:    { label: "Downloading",     color: "#0891B2", bg: "#ECFEFF" },
  RECONSTRUCTING: { label: "Reconstructing",  color: "#D97706", bg: "#FFFBEB" },
  CONVERTING:     { label: "Converting",      color: "#7C3AED", bg: "#F5F3FF" },
  ANALYZING:      { label: "Analyzing",       color: "#2563EB", bg: "#EFF6FF" },
  UPLOADING:      { label: "Uploading",       color: "#0891B2", bg: "#ECFEFF" },
  COMPLETED:      { label: "Complete",        color: "#059669", bg: "#ECFDF5" },
  FAILED:         { label: "Failed",          color: "#DC2626", bg: "#FEF2F2" },
};

const FORMAT_META: { key: keyof PrecisionScan; label: string; ext: string; icon: string }[] = [
  { key: "skpUrl",  label: "SketchUp",  ext: ".skp",  icon: "📐" },
  { key: "objUrl",  label: "OBJ",       ext: ".obj",  icon: "🧊" },
  { key: "daeUrl",  label: "Collada",   ext: ".dae",  icon: "🔧" },
  { key: "stepUrl", label: "STEP",      ext: ".stp",  icon: "⚙️" },
  { key: "stlUrl",  label: "STL",       ext: ".stl",  icon: "🖨️" },
  { key: "gltfUrl", label: "glTF",      ext: ".gltf", icon: "🌐" },
  { key: "glbUrl",  label: "GLB",       ext: ".glb",  icon: "📦" },
  { key: "usdzUrl", label: "USDZ",      ext: ".usdz", icon: "🍎" },
];

// ── Page ───────────────────────────────────────────────────────

export default function PrecisionScansPage() {
  const [view, setView] = useState<View>("list");
  const [scans, setScans] = useState<PrecisionScan[]>([]);
  const [selected, setSelected] = useState<PrecisionScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load list ──────────────────────────────────────────────────

  const loadScans = useCallback(async () => {
    try {
      const data = await apiFetch<PrecisionScan[]>("/precision-scans");
      setScans(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  // ── Open detail ────────────────────────────────────────────────

  const openDetail = useCallback(async (id: string) => {
    try {
      const scan = await apiFetch<PrecisionScan>(`/precision-scans/${id}`);
      setSelected(scan);
      setView("detail");

      // Poll if still processing
      if (!["COMPLETED", "FAILED"].includes(scan.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const updated = await apiFetch<PrecisionScan>(`/precision-scans/${id}`);
            setSelected(updated);
            if (["COMPLETED", "FAILED"].includes(updated.status)) {
              if (pollRef.current) clearInterval(pollRef.current);
              void loadScans(); // Refresh list
            }
          } catch { /* keep polling */ }
        }, 3000);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scan");
    }
  }, [loadScans]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const goBack = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setView("list");
    setSelected(null);
    void loadScans();
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {view === "list" ? (
        <ScanList
          scans={scans}
          loading={loading}
          error={error}
          onSelect={openDetail}
          onRefresh={loadScans}
        />
      ) : selected ? (
        <ScanDetail scan={selected} onBack={goBack} />
      ) : null}
    </div>
  );
}

// ── Scan List ──────────────────────────────────────────────────

function ScanList({
  scans,
  loading,
  error,
  onSelect,
  onRefresh,
}: {
  scans: PrecisionScan[];
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#0F172A" }}>
            Precision Scans
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
            NexCAD — engineering-grade 3D models from iPhone LiDAR
          </p>
        </div>
        <button
          onClick={onRefresh}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #E2E8F0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "#475569",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#FEF2F2", color: "#DC2626", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading…</div>
      ) : scans.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 40, background: "#F8FAFC",
          borderRadius: 12, border: "1px solid #E2E8F0",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#334155" }}>No precision scans yet</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            Start a Precision Scan from the mobile app to see results here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scans.map((scan) => {
            const sc = STATUS_CONFIG[scan.status] || STATUS_CONFIG.PENDING;
            return (
              <div
                key={scan.id}
                onClick={() => onSelect(scan.id)}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#94A3B8")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E2E8F0")}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
                    {scan.name || `Scan ${scan.id.slice(0, 8)}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                    {scan.imageCount} images
                    {scan.project ? ` · ${scan.project.name}` : ""}
                    {scan.createdBy ? ` · ${scan.createdBy.firstName} ${scan.createdBy.lastName}` : ""}
                    {" · "}
                    {new Date(scan.createdAt).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: sc.color,
                    background: sc.bg,
                    padding: "4px 10px",
                    borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}
                >
                  {sc.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Scan Detail ────────────────────────────────────────────────

function ScanDetail({ scan, onBack }: { scan: PrecisionScan; onBack: () => void }) {
  const sc = STATUS_CONFIG[scan.status] || STATUS_CONFIG.PENDING;
  const dims = scan.analysis?.dimensions;
  const isProcessing = !["COMPLETED", "FAILED"].includes(scan.status);

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 15, color: "#3B82F6", fontWeight: 500, padding: 0,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, flex: 1, color: "#0F172A" }}>
          {scan.name || `Scan ${scan.id.slice(0, 8)}`}
        </h1>
        <span
          style={{
            fontSize: 11, fontWeight: 700, color: "#F97316",
            border: "1px solid #F97316", padding: "3px 8px", borderRadius: 6,
          }}
        >
          NexCAD
        </span>
      </div>

      {/* Status */}
      <div
        style={{
          padding: 16, borderRadius: 10, background: sc.bg,
          border: `1px solid ${sc.color}33`, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 12,
        }}
      >
        {isProcessing && (
          <div style={{
            width: 16, height: 16, border: `2px solid ${sc.color}`,
            borderTopColor: "transparent", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
        )}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: sc.color }}>{sc.label}</div>
          {scan.error && (
            <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>{scan.error}</div>
          )}
          {scan.processingMs != null && scan.status === "COMPLETED" && (
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Processed in {(scan.processingMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <MetaItem label="Images" value={String(scan.imageCount)} />
        <MetaItem label="Detail" value={scan.detailLevel} />
        {scan.project && <MetaItem label="Project" value={scan.project.name} />}
        {scan.createdBy && (
          <MetaItem label="By" value={`${scan.createdBy.firstName} ${scan.createdBy.lastName}`} />
        )}
        <MetaItem
          label="Created"
          value={new Date(scan.createdAt).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        />
      </div>

      {/* Dimensions */}
      {dims && (
        <div
          style={{
            padding: 20, borderRadius: 10, background: "#F8FAFC",
            border: "1px solid #E2E8F0", marginBottom: 16, textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Measured Dimensions
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
            <DimBox value={dims.length} label="Length" />
            <span style={{ fontSize: 20, color: "#CBD5E1" }}>×</span>
            <DimBox value={dims.width} label="Width" />
            <span style={{ fontSize: 20, color: "#CBD5E1" }}>×</span>
            <DimBox value={dims.height} label="Height" />
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 8 }}>{dims.unit}</div>
        </div>
      )}

      {/* Mesh stats */}
      {scan.analysis && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {scan.analysis.vertexCount != null && (
            <StatCard label="Vertices" value={scan.analysis.vertexCount.toLocaleString()} />
          )}
          {scan.analysis.faceCount != null && (
            <StatCard label="Faces" value={scan.analysis.faceCount.toLocaleString()} />
          )}
          {scan.analysis.dominantPlanes != null && (
            <StatCard label="Planes" value={String(scan.analysis.dominantPlanes)} />
          )}
          {scan.analysis.surfaceArea != null && (
            <StatCard label="Surface" value={`${scan.analysis.surfaceArea.toFixed(3)} m²`} />
          )}
        </div>
      )}

      {/* Download formats */}
      {scan.status === "COMPLETED" && (
        <div
          style={{
            borderRadius: 10, border: "1px solid #E2E8F0",
            background: "#fff", overflow: "hidden", marginBottom: 16,
          }}
        >
          <div
            style={{
              padding: "12px 16px", borderBottom: "1px solid #E2E8F0",
              fontSize: 11, fontWeight: 600, color: "#94A3B8",
              letterSpacing: 1, textTransform: "uppercase",
            }}
          >
            Download Formats
          </div>
          {FORMAT_META.map(({ key, label, ext, icon }) => {
            const url = scan[key] as string | null;
            if (!url) return null;
            return (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderBottom: "1px solid #F1F5F9",
                  textDecoration: "none", color: "#0F172A",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{icon}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                  {label} <span style={{ color: "#94A3B8", fontWeight: 400 }}>({ext})</span>
                </span>
                <span style={{ fontSize: 14, color: "#3B82F6", fontWeight: 600 }}>↓</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Processing spinner animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DimBox({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A" }}>{value.toFixed(1)}</div>
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#F8FAFC", borderRadius: 8, padding: "12px 18px",
        textAlign: "center", minWidth: 80,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{label}</div>
    </div>
  );
}
