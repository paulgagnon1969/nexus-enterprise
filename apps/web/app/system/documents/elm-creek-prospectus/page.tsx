"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function apiCall<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers as Record<string, string>) } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `API ${res.status}`);
  }
  return res.json();
}

interface CndaTemplate { id: string; name: string; isDefault: boolean; }
interface SystemDocListItem { id: string; code: string; title: string; category: string | null; }

interface ChapterEntry {
  id: string;
  title: string;
  revision: string;
  summary: string;
  keyMetric?: string;
}

interface ChapterGroup {
  group: string;
  icon: string;
  description: string;
  chapters: ChapterEntry[];
}

interface ProjectSummary {
  totalAcres: number;
  totalUnits: number;
  totalProjectCost: string;
  equityRaise: string;
  projectedIRR: string;
  timeline: string;
}

interface ElmCreekData {
  chapterGroups: ChapterGroup[];
  totalChapters: number;
  totalAppendices: number;
  projectSummary: ProjectSummary;
}

export default function ElmCreekProspectusPage() {
  const router = useRouter();
  const [data, setData] = useState<ElmCreekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // PIP Campaign modal state
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/admin/sops/elm-creek-manual`, {
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

  const toggleGroup = (group: string) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    setExpandedGroups(next);
  };

  const expandAll = () => {
    if (!data) return;
    setExpandedGroups(new Set(data.chapterGroups.map((g) => g.group)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>🏘️ Elm Creek Investor Prospectus</h1>
          <p style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
            Phase 1 Investor Prospectus — chapters, financials, team, and terms.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowCampaignModal(true)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🚀 Start PIP Campaign
          </button>
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
      </div>

      {showCampaignModal && (
        <StartPipCampaignModal
          onClose={() => setShowCampaignModal(false)}
          onCreated={(campaignId) => {
            setShowCampaignModal(false);
            router.push(`/system/campaigns?detail=${campaignId}&tab=invites`);
          }}
        />
      )}

      {/* Loading / Error */}
      {loading && <p style={{ color: "#6b7280" }}>Loading prospectus data…</p>}
      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {data && (
        <>
          {/* Project Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SummaryCard label="Total Acres" value={String(data.projectSummary.totalAcres)} color="#059669" />
            <SummaryCard label="Phase 1 Units" value={String(data.projectSummary.totalUnits)} color="#0284c7" />
            <SummaryCard label="Project Cost" value={data.projectSummary.totalProjectCost} color="#7c3aed" />
            <SummaryCard label="Equity Raise" value={data.projectSummary.equityRaise} color="#b45309" />
            <SummaryCard label="Projected IRR" value={data.projectSummary.projectedIRR} color="#059669" />
            <SummaryCard label="Timeline" value={data.projectSummary.timeline} color="#0284c7" />
          </div>

          {/* Counts bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              padding: "10px 14px",
              backgroundColor: "#f9fafb",
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 14, color: "#374151" }}>
              <strong>{data.totalChapters}</strong> chapters · <strong>{data.totalAppendices}</strong> appendices ·{" "}
              <strong>{data.chapterGroups.length}</strong> groups
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={expandAll}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Chapter Groups */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.chapterGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.group);
              return (
                <div
                  key={group.group}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.group)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 18px",
                      background: isExpanded ? "#f0f9ff" : "#fff",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{group.icon}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{group.group}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{group.description}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#0369a1",
                          backgroundColor: "#e0f2fe",
                          padding: "2px 8px",
                          borderRadius: 10,
                        }}
                      >
                        {group.chapters.length} {group.chapters.length === 1 ? "chapter" : "chapters"}
                      </span>
                      <span style={{ fontSize: 16, color: "#9ca3af" }}>{isExpanded ? "▼" : "▶"}</span>
                    </div>
                  </button>

                  {/* Expanded Chapters */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #e5e7eb" }}>
                      {group.chapters.map((ch) => (
                        <div
                          key={ch.id}
                          style={{
                            padding: "14px 18px 14px 52px",
                            borderBottom: "1px solid #f3f4f6",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{ch.title}</span>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                  backgroundColor: "#f3f4f6",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {ch.revision}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5, maxWidth: 640 }}>
                              {ch.summary}
                            </p>
                          </div>
                          {ch.keyMetric && (
                            <div
                              style={{
                                whiteSpace: "nowrap",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#059669",
                                backgroundColor: "#ecfdf5",
                                padding: "4px 10px",
                                borderRadius: 6,
                                marginLeft: 12,
                              }}
                            >
                              {ch.keyMetric}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer link to full manual */}
          <div
            style={{
              marginTop: 24,
              padding: 16,
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              Full manual with Mermaid diagrams available at{" "}
              <code style={{ fontSize: 12, backgroundColor: "#e5e7eb", padding: "2px 6px", borderRadius: 4 }}>
                docs/elm-creek/ELM-CREEK-PROSPECTUS-MANUAL.md
              </code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// --- Start PIP Campaign Modal ---

function StartPipCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) {
  const [name, setName] = useState("Elm Creek Investor Prospectus");
  const [slug, setSlug] = useState("elm-creek-investor-prospectus");
  const [description, setDescription] = useState(
    "Phase 1 Investor Prospectus — 174.61 acres, 128 units, $7.8M total, 18–24% IRR",
  );
  const [cndaTemplateId, setCndaTemplateId] = useState("");
  const [questionnaireEnabled, setQuestionnaireEnabled] = useState(true);
  const [templates, setTemplates] = useState<CndaTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load CNDA templates on mount
  useEffect(() => {
    apiCall<CndaTemplate[]>("/cnda-templates")
      .then((data) => {
        setTemplates(data);
        const def = data.find((t) => t.isDefault) || data[0];
        if (def) setCndaTemplateId(def.id);
      })
      .catch(() => {});
  }, []);

  const handleNameChange = (v: string) => {
    setName(v);
    setSlug(
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !slug.trim() || !cndaTemplateId) return;
      setSaving(true);
      setError(null);

      try {
        // Step 1: Create campaign
        setStatus("Creating campaign...");
        const campaign = await apiCall<{ id: string }>("/campaigns", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            cndaTemplateId,
            questionnaireEnabled,
          }),
        });

        // Step 2: Find Elm Creek SystemDocuments
        setStatus("Attaching documents...");
        let docsAttached = 0;
        try {
          const systemDocs = await apiCall<SystemDocListItem[]>("/system-documents");
          const elmCreekDocs = systemDocs.filter(
            (d) =>
              d.code.toLowerCase().includes("elm-creek") ||
              d.title.toLowerCase().includes("elm creek"),
          );
          for (const doc of elmCreekDocs) {
            try {
              await apiCall(`/campaigns/${campaign.id}/documents`, {
                method: "POST",
                body: JSON.stringify({ systemDocumentId: doc.id }),
              });
              docsAttached++;
            } catch {
              // Skip if doc can't be added
            }
          }
        } catch {
          // SystemDocs fetch failed — continue without docs
        }

        // Step 3: Activate if documents were attached
        if (docsAttached > 0) {
          setStatus("Activating campaign...");
          try {
            await apiCall(`/campaigns/${campaign.id}/activate`, {
              method: "POST",
            });
          } catch {
            // Activation may fail if no docs — that's OK, user can activate manually
          }
        }

        // Step 4: Navigate to campaign invites
        setStatus(
          docsAttached > 0
            ? "Campaign created & activated! Redirecting..."
            : "Campaign created! Add documents from the Documents tab, then activate.",
        );
        setTimeout(() => onCreated(campaign.id), docsAttached > 0 ? 500 : 1500);
      } catch (e: any) {
        setError(e.message);
        setSaving(false);
      }
    },
    [name, slug, description, cndaTemplateId, questionnaireEnabled, onCreated],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 520,
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>🚀 Start PIP Campaign</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
          Create a secure portal campaign for the Elm Creek Prospectus.
          Elm Creek documents will be attached and the campaign activated automatically.
        </p>

        {error && (
          <div
            style={{
              padding: 10,
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {status && saving && (
          <div
            style={{
              padding: 10,
              background: "#ecfdf5",
              color: "#065f46",
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            ⏳ {status}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              Campaign Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              disabled={saving}
              style={inputStyleLocal}
              placeholder="Elm Creek Investor Prospectus"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              URL Slug *
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              disabled={saving}
              style={{ ...inputStyleLocal, fontFamily: "monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={saving}
              style={{ ...inputStyleLocal, resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              CNDA Template *
            </label>
            <select
              value={cndaTemplateId}
              onChange={(e) => setCndaTemplateId(e.target.value)}
              disabled={saving}
              style={{ ...inputStyleLocal, cursor: "pointer" }}
            >
              <option value="">Select template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={questionnaireEnabled}
                onChange={(e) => setQuestionnaireEnabled(e.target.checked)}
                disabled={saving}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: "#374151" }}>
                Require questionnaire before access
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !name.trim() || !slug.trim() || !cndaTemplateId || saving
              }
              style={{
                flex: 2,
                padding: "10px 16px",
                borderRadius: 6,
                border: "none",
                background: "#0f172a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity:
                  !name.trim() || !slug.trim() || !cndaTemplateId || saving
                    ? 0.5
                    : 1,
              }}
            >
              {saving ? "Creating..." : "Create & Go to Invites →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyleLocal: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

// --- Summary Card Component ---

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        padding: 14,
        backgroundColor: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{label}</div>
    </div>
  );
}
