"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────────

interface ScanSummary {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  recent: {
    id: string;
    name: string | null;
    status: string;
    imageCount: number;
    createdAt: string;
    project?: { id: string; name: string } | null;
  }[];
}

interface AssessmentSummary {
  total: number;
  complete: number;
  processing: number;
  failed: number;
  unassigned: number;
  recent: {
    id: string;
    videoFileName: string | null;
    status: string;
    sourceType: string;
    createdAt: string;
    project?: { id: string; name: string } | null;
    _count?: { findings: number };
  }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  COMPLETED: { color: "#059669", bg: "#ECFDF5" },
  COMPLETE:  { color: "#059669", bg: "#ECFDF5" },
  REVIEWED:  { color: "#2563EB", bg: "#EFF6FF" },
  PROCESSING:{ color: "#D97706", bg: "#FFFBEB" },
  PENDING:   { color: "#64748B", bg: "#F1F5F9" },
  FAILED:    { color: "#DC2626", bg: "#FEF2F2" },
};

function StatusDot({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING;
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 600, padding: "1px 6px",
      borderRadius: 999, color: s.color, background: s.bg,
    }}>
      {status}
    </span>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [assessSummary, setAssessSummary] = useState<AssessmentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scans, assessments] = await Promise.all([
        apiFetch<any[]>("/precision-scans"),
        apiFetch<any>("/video-assessment"),
      ]);

      // Build scan summary
      const scanList = Array.isArray(scans) ? scans : [];
      const scanSum: ScanSummary = {
        total: scanList.length,
        completed: scanList.filter((s: any) => s.status === "COMPLETED").length,
        failed: scanList.filter((s: any) => s.status === "FAILED").length,
        processing: scanList.filter((s: any) => !["COMPLETED", "FAILED", "PENDING"].includes(s.status)).length,
        recent: scanList.slice(0, 5).map((s: any) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          imageCount: s._count?.images ?? s.imageCount ?? 0,
          createdAt: s.createdAt,
          project: s.project,
        })),
      };
      setScanSummary(scanSum);

      // Build assessment summary
      const assessList = Array.isArray(assessments) ? assessments : assessments?.items ?? [];
      const assessSum: AssessmentSummary = {
        total: assessList.length,
        complete: assessList.filter((a: any) => a.status === "COMPLETE" || a.status === "REVIEWED").length,
        processing: assessList.filter((a: any) => a.status === "PROCESSING").length,
        failed: assessList.filter((a: any) => a.status === "FAILED").length,
        unassigned: assessList.filter((a: any) => !a.projectId).length,
        recent: assessList.slice(0, 5).map((a: any) => ({
          id: a.id,
          videoFileName: a.videoFileName,
          status: a.status,
          sourceType: a.sourceType,
          createdAt: a.createdAt,
          project: a.project,
          _count: a._count,
        })),
      };
      setAssessSummary(assessSum);
    } catch {
      // Fail silently — sections show "0" counts
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#0F172A" }}>Reports</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
          Tenant-wide rollups for scans, assessments, and field data
        </p>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "#6b7280", padding: 16 }}>Loading reports…</div>
      )}

      {/* Report cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {/* Precision Scans card */}
        <ReportCard
          icon="📐"
          title="Precision Scans"
          subtitle="NexCAD — LiDAR 3D scans across all projects"
          href="/precision-scans"
          stats={scanSummary ? [
            { label: "Total", value: scanSummary.total },
            { label: "Completed", value: scanSummary.completed, color: "#059669" },
            { label: "Processing", value: scanSummary.processing, color: "#D97706" },
            { label: "Failed", value: scanSummary.failed, color: "#DC2626" },
          ] : []}
          loading={loading}
        >
          {scanSummary && scanSummary.recent.length > 0 && (
            <RecentList>
              {scanSummary.recent.map(s => (
                <RecentItem key={s.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusDot status={s.status} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                      {s.name || `Scan ${s.id.slice(0, 8)}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {formatDate(s.createdAt)}
                    {s.project ? ` · ${s.project.name}` : " · Unassigned"}
                  </div>
                </RecentItem>
              ))}
            </RecentList>
          )}
        </ReportCard>

        {/* NexBRIDGE Assessments card */}
        <ReportCard
          icon="📹"
          title="NexBRIDGE Assessments"
          subtitle="AI video assessments across all projects"
          stats={assessSummary ? [
            { label: "Total", value: assessSummary.total },
            { label: "Complete", value: assessSummary.complete, color: "#059669" },
            { label: "Processing", value: assessSummary.processing, color: "#D97706" },
            { label: "Unassigned", value: assessSummary.unassigned, color: "#64748b" },
          ] : []}
          loading={loading}
        >
          {assessSummary && assessSummary.recent.length > 0 && (
            <RecentList>
              {assessSummary.recent.map(a => (
                <RecentItem key={a.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusDot status={a.status} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                      {a.videoFileName || `Assessment ${a.id.slice(0, 8)}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {formatDate(a.createdAt)} · {a.sourceType}
                    {a._count?.findings ? ` · ${a._count.findings} findings` : ""}
                    {a.project ? ` · ${a.project.name}` : " · Unassigned"}
                  </div>
                </RecentItem>
              ))}
            </RecentList>
          )}
        </ReportCard>

        {/* Placeholder cards for future reports */}
        <ReportCard
          icon="📊"
          title="Financial Reports"
          subtitle="Project billing, PETL summaries, and cost tracking"
          href="/financial"
          stats={[]}
          loading={false}
          placeholder="Coming soon — consolidated financial reporting across projects."
        />

        <ReportCard
          icon="🏗️"
          title="Field Reports"
          subtitle="Daily logs, timecards, and safety assessments"
          stats={[]}
          loading={false}
          placeholder="Coming soon — aggregated daily log and timecard reporting."
        />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: number;
  color?: string;
}

function ReportCard({
  icon,
  title,
  subtitle,
  href,
  stats,
  loading,
  placeholder,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  href?: string;
  stats: StatItem[];
  loading: boolean;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const content = (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
      padding: 20, display: "flex", flexDirection: "column", gap: 12,
      height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{title}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{subtitle}</div>
          </div>
        </div>
        {href && (
          <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>View all →</span>
        )}
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color ?? "#111827" }}>
                {loading ? "—" : s.value}
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {placeholder && (
        <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", padding: "8px 0" }}>
          {placeholder}
        </div>
      )}

      {children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }
  return content;
}

function RecentList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderTop: "1px solid #f1f5f9", paddingTop: 8,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Recent
      </div>
      {children}
    </div>
  );
}

function RecentItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "6px 8px", borderRadius: 6, background: "#fafafa",
      border: "1px solid #f1f5f9",
    }}>
      {children}
    </div>
  );
}
