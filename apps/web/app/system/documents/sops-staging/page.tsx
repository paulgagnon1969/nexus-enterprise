"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type SopType = "CAM" | "Session Log" | "Feature SOP" | "Infrastructure" | "Admin SOP" | "Policy" | "Training Manual" | "Orphan SOP";

interface StagedSop {
  code: string;
  title: string;
  revision: string;
  status: string;
  module: string;
  sopType: SopType;
  fileModifiedAt: string;
  frontmatterUpdated: string;
  syncStatus: "new" | "updated" | "synced";
  currentSystemRevision?: string;
  systemDocumentId?: string;
}

interface SyncResult {
  code: string;
  title: string;
  action: "created" | "updated" | "unchanged" | "error";
  previousRevision?: string;
  newRevision?: string;
  systemDocumentId?: string;
  error?: string;
}

interface SyncReport {
  timestamp: string;
  results: SyncResult[];
  summary: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  };
}

type SortField = "title" | "fileModifiedAt" | "module" | "sopType";
type SortDir = "asc" | "desc";

export default function SystemSopsStagingPage() {
  const [stagedSops, setStagedSops] = useState<StagedSop[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>("fileModifiedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<SopType | "all">("all");

  const loadStagedSops = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/admin/sops/staged`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load staged SOPs (${res.status})`);
      }

      const data = await res.json();
      setStagedSops(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStagedSops();
  }, []);

  const handleSync = async (codes?: string[]) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setSyncing(true);
    setSyncReport(null);

    try {
      const res = await fetch(`${API_BASE}/admin/sops/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ codes }),
      });

      if (!res.ok) {
        throw new Error(`Sync failed (${res.status})`);
      }

      const report = await res.json();
      setSyncReport(report);

      // Refresh the list
      await loadStagedSops();
      setSelectedCodes(new Set());
    } catch (err: any) {
      setError(err?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePreview = async (code: string) => {
    if (previewCode === code) {
      setPreviewCode(null);
      setPreviewContent(null);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setPreviewCode(code);
    setPreviewLoading(true);

    try {
      const res = await fetch(`${API_BASE}/admin/sops/staged/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load preview`);
      }

      const data = await res.json();
      setPreviewContent(data);
    } catch {
      setPreviewContent(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleSelection = (code: string) => {
    const next = new Set(selectedCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setSelectedCodes(next);
  };

  const selectAllPending = () => {
    if (!stagedSops) return;
    const pending = stagedSops.filter((s) => s.syncStatus !== "synced");
    setSelectedCodes(new Set(pending.map((s) => s.code)));
  };

  const filterSops = (sops: StagedSop[]) => {
    if (typeFilter === "all") return sops;
    return sops.filter((s) => s.sopType === typeFilter);
  };

  const sortSops = (sops: StagedSop[]) => {
    return [...sops].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "fileModifiedAt") {
        cmp = new Date(a.fileModifiedAt).getTime() - new Date(b.fileModifiedAt).getTime();
      } else if (sortField === "module") {
        cmp = a.module.localeCompare(b.module);
      } else if (sortField === "sopType") {
        cmp = a.sopType.localeCompare(b.sopType);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "title" ? "asc" : "desc");
    }
  };

  const pendingSops = sortSops(filterSops(stagedSops?.filter((s) => s.syncStatus !== "synced") ?? []));
  const syncedSops = sortSops(filterSops(stagedSops?.filter((s) => s.syncStatus === "synced") ?? []));
  const selectedCount = selectedCodes.size;

  // Compute type counts for the filter
  const typeCounts: Record<string, number> = {};
  for (const sop of stagedSops ?? []) {
    typeCounts[sop.sopType] = (typeCounts[sop.sopType] || 0) + 1;
  }

  const formatDate = (isoDate: string) => {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (isoDate: string) => {
    const d = new Date(isoDate);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const SortHeader = ({ field, label, width }: { field: SortField; label: string; width?: number }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        padding: "10px 12px",
        textAlign: "left",
        borderBottom: "1px solid #fde047",
        width,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {label} {sortField === field && (sortDir === "asc" ? "↑" : "↓")}
    </th>
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>📋 Staged SOPs</h1>
          <p style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
            SOPs from <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>docs/sops-staging/</code> ready for import to System Documents.
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

      {/* Type Filter */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Filter by type:</span>
        {(["all", "Feature SOP", "CAM", "Training Manual", "Session Log", "Infrastructure", "Admin SOP", "Policy", "Orphan SOP"] as const).map((t) => {
          const count = t === "all" ? (stagedSops?.length ?? 0) : (typeCounts[t] || 0);
          if (t !== "all" && count === 0) return null;
          const isActive = typeFilter === t;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: isActive ? "#dbeafe" : "#ffffff",
                color: isActive ? "#1d4ed8" : "#374151",
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t === "all" ? "All" : t} ({count})
            </button>
          );
        })}
      </div>

      {/* Sync Actions */}
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          background: "#fefce8",
          borderRadius: 8,
          border: "1px solid #fde047",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={selectAllPending}
            disabled={loading || pendingSops.length === 0}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 12,
              cursor: pendingSops.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Select All Pending ({pendingSops.length})
          </button>
          {selectedCount > 0 && (
            <span style={{ fontSize: 12, color: "#854d0e" }}>
              {selectedCount} selected
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSync(Array.from(selectedCodes))}
            disabled={syncing || selectedCount === 0}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: selectedCount > 0 ? "#2563eb" : "#e5e7eb",
              color: selectedCount > 0 ? "#ffffff" : "#9ca3af",
              fontSize: 13,
              fontWeight: 500,
              cursor: selectedCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "Syncing..." : `Sync Selected (${selectedCount})`}
          </button>
          <button
            onClick={() => handleSync()}
            disabled={syncing || pendingSops.length === 0}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #16a34a",
              background: pendingSops.length > 0 ? "#16a34a" : "#e5e7eb",
              color: pendingSops.length > 0 ? "#ffffff" : "#9ca3af",
              fontSize: 13,
              fontWeight: 500,
              cursor: pendingSops.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "Syncing..." : "Sync All Pending"}
          </button>
        </div>
      </div>

      {/* Sync Report */}
      {syncReport && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: "#f0fdf4",
            borderRadius: 8,
            border: "1px solid #bbf7d0",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#166534" }}>
            ✅ Sync Complete
          </div>
          <div style={{ fontSize: 13, color: "#166534" }}>
            {syncReport.summary.created} created, {syncReport.summary.updated} updated,{" "}
            {syncReport.summary.unchanged} unchanged
            {syncReport.summary.errors > 0 && (
              <span style={{ color: "#b91c1c" }}>, {syncReport.summary.errors} errors</span>
            )}
          </div>
          {syncReport.results.some((r) => r.action === "error") && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
              {syncReport.results
                .filter((r) => r.action === "error")
                .map((r) => (
                  <div key={r.code}>
                    {r.code}: {r.error}
                  </div>
                ))}
            </div>
          )}
          <button
            onClick={() => setSyncReport(null)}
            style={{
              marginTop: 8,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #86efac",
              background: "transparent",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            background: "#fef2f2",
            borderRadius: 8,
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
          Loading staged SOPs...
        </div>
      )}

      {/* Empty state */}
      {!loading && stagedSops && stagedSops.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: 8,
            border: "1px dashed #d1d5db",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>No Staged SOPs</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Place SOP markdown files in <code>docs/sops-staging/</code> to see them here.
          </div>
        </div>
      )}

      {/* Pending SOPs */}
      {!loading && pendingSops.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#854d0e" }}>
            🔸 Pending ({pendingSops.length})
          </h2>
          <div
            style={{
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #fde047",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fefce8" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fde047", width: 40 }}></th>
                  <SortHeader field="title" label="SOP" />
                  <SortHeader field="sopType" label="Type" width={110} />
                  <SortHeader field="module" label="Module" width={100} />
                  <SortHeader field="fileModifiedAt" label="File Date" width={130} />
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fde047", width: 80 }}>Rev</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fde047", width: 80 }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #fde047", width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingSops.map((sop) => (
                  <SopRow
                    key={sop.code}
                    sop={sop}
                    selected={selectedCodes.has(sop.code)}
                    onToggleSelect={() => toggleSelection(sop.code)}
                    previewCode={previewCode}
                    previewContent={previewContent}
                    previewLoading={previewLoading}
                    onPreview={() => handlePreview(sop.code)}
                    formatDateTime={formatDateTime}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Synced SOPs */}
      {!loading && syncedSops.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#166534" }}>
            ✅ Synced ({syncedSops.length})
          </h2>
          <div
            style={{
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 40 }}></th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>SOP</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 110 }}>Type</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 100 }}>Module</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 130 }}>File Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 80 }}>Rev</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", width: 80 }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e5e7eb", width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {syncedSops.map((sop) => (
                  <SopRow
                    key={sop.code}
                    sop={sop}
                    selected={false}
                    onToggleSelect={() => {}}
                    previewCode={previewCode}
                    previewContent={previewContent}
                    previewLoading={previewLoading}
                    onPreview={() => handlePreview(sop.code)}
                    formatDateTime={formatDateTime}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div
        style={{
          marginTop: 32,
          padding: 16,
          background: "#f0f9ff",
          borderRadius: 8,
          border: "1px solid #bae6fd",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: "#0c4a6e" }}>
          📖 How SOP Staging Works
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#0369a1", lineHeight: 1.8 }}>
          <li>Warp creates SOP files in <code>docs/sops-staging/</code> when features are marked ready for production</li>
          <li>SOPs appear here with status: <strong>New</strong> (first time) or <strong>Updated</strong> (content changed)</li>
          <li>Click <strong>Sync</strong> to import into System Documents Library</li>
          <li>Go to <Link href="/system/documents/library" style={{ color: "#2563eb" }}>System Documents Library</Link> to publish to tenants</li>
        </ol>
      </div>
    </div>
  );
}

// --- SOP Row Component ---

function SopRow({
  sop,
  selected,
  onToggleSelect,
  previewCode,
  previewContent,
  previewLoading,
  onPreview,
  formatDateTime,
}: {
  sop: StagedSop;
  selected: boolean;
  onToggleSelect: () => void;
  previewCode: string | null;
  previewContent: any;
  previewLoading: boolean;
  onPreview: () => void;
  formatDateTime: (iso: string) => string;
}) {
  const isPreviewOpen = previewCode === sop.code;

  return (
    <>
      <tr style={{ background: selected ? "#fef9c3" : "transparent" }}>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
          {sop.syncStatus !== "synced" && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
            />
          )}
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontWeight: 500 }}>{sop.title}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{sop.code}.md</div>
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <SopTypeBadge type={sop.sopType} />
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
          {sop.module}
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 11, color: "#6b7280" }}>
          {formatDateTime(sop.fileModifiedAt)}
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
          {sop.revision}
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <SyncStatusBadge status={sop.syncStatus} />
        </td>
        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
            <button
              onClick={onPreview}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: isPreviewOpen ? "#e5e7eb" : "#ffffff",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {isPreviewOpen ? "Hide" : "Preview"}
            </button>
            {sop.systemDocumentId && (
              <Link
                href={`/system/documents/${sop.systemDocumentId}`}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #2563eb",
                  background: "#eff6ff",
                  color: "#2563eb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                View
              </Link>
            )}
          </div>
        </td>
      </tr>
      {isPreviewOpen && (
        <tr>
          <td colSpan={8} style={{ padding: 0, borderBottom: "1px solid #e5e7eb" }}>
            <div
              style={{
                padding: 16,
                background: "#f9fafb",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              {previewLoading ? (
                <div style={{ color: "#6b7280" }}>Loading preview...</div>
              ) : previewContent ? (
                <div>
                  <div style={{ marginBottom: 12, fontSize: 12, color: "#6b7280" }}>
                    <strong>Module:</strong> {previewContent.frontmatter?.module} ·{" "}
                    <strong>Author:</strong> {previewContent.frontmatter?.author} ·{" "}
                    <strong>Status:</strong> {previewContent.frontmatter?.status}
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      padding: 16,
                      maxHeight: 400,
                      overflow: "auto",
                      fontSize: 13,
                    }}
                    dangerouslySetInnerHTML={{ __html: previewContent.htmlBody }}
                  />
                </div>
              ) : (
                <div style={{ color: "#b91c1c" }}>Failed to load preview</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SopTypeBadge({ type }: { type: SopType }) {
  const styles: Record<SopType, { bg: string; color: string; icon: string }> = {
    "CAM": { bg: "#faf5ff", color: "#7c3aed", icon: "🏆" },
    "Feature SOP": { bg: "#ecfdf5", color: "#059669", icon: "⚙️" },
    "Session Log": { bg: "#f0f9ff", color: "#0284c7", icon: "📝" },
    "Infrastructure": { bg: "#fef3c7", color: "#b45309", icon: "🔧" },
    "Admin SOP": { bg: "#fce7f3", color: "#be185d", icon: "🛡️" },
    "Policy": { bg: "#e0e7ff", color: "#4338ca", icon: "📜" },
    "Training Manual": { bg: "#fff7ed", color: "#c2410c", icon: "📘" },
    "Orphan SOP": { bg: "#f3f4f6", color: "#6b7280", icon: "❓" },
  };

  const s = styles[type] ?? styles["Orphan SOP"];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontSize: 10,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 10 }}>{s.icon}</span>
      {type}
    </span>
  );
}

function SyncStatusBadge({ status }: { status: "new" | "updated" | "synced" }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    new: { bg: "#dcfce7", color: "#166534", label: "New" },
    updated: { bg: "#fef3c7", color: "#92400e", label: "Updated" },
    synced: { bg: "#e5e7eb", color: "#6b7280", label: "Synced" },
  };

  const s = styles[status] ?? styles.synced;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {s.label}
    </span>
  );
}
