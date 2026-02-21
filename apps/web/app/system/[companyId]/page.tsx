"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyDto {
  id: string;
  name: string;
  deletedAt?: string | null;
}

interface ProjectDto {
  id: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
  createdAt: string;
}

interface SystemTag {
  id: string;
  code: string;
  label: string;
  color?: string;
  category?: string;
}

interface CompanyTag {
  id: string;
  systemTag: SystemTag;
  assignedAt: string;
}

export default function SystemOrganizationPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = React.use(params);
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("projectId");

  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const [showCompanyId, setShowCompanyId] = useState(false);

  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{
    dailyLogs: any[];
    tasks: any[];
    petlEdits: any[];
  } | null>(null);

  const [deactivating, setDeactivating] = useState(false);
  const [deactivateMessage, setDeactivateMessage] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivateMessage, setReactivateMessage] = useState<string | null>(null);

  // System tags
  const [companyTags, setCompanyTags] = useState<CompanyTag[]>([]);
  const [allTags, setAllTags] = useState<SystemTag[]>([]);
  const [showAddTag, setShowAddTag] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // First, try to resolve the friendly tenant name from the admin companies list
        // so the heading shows the company name instead of the raw TID.
        try {
          const adminRes = await fetch(`${API_BASE}/admin/companies`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (adminRes.ok) {
            const companiesJson = await adminRes.json();
            if (Array.isArray(companiesJson)) {
              const match = companiesJson.find((c: any) => c.id === companyId);
              if (match?.name) {
                setCompany({ id: companyId, name: match.name, deletedAt: match.deletedAt ?? null });
              }
            }
          }
        } catch {
          // best-effort only; fall back to other hints
        }

        const projectsRes = await fetch(
          `${API_BASE}/admin/companies/${companyId}/projects`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!projectsRes.ok) {
          throw new Error(`Failed to load jobs (${projectsRes.status})`);
        }

        const projectsJson = await projectsRes.json();
        setProjects(Array.isArray(projectsJson) ? projectsJson : []);

        // Fallback: if we still don't have a company name from /admin/companies,
        // derive something from projects if the payload happens to include it.
        if (!company && Array.isArray(projectsJson) && projectsJson.length > 0) {
          const first = projectsJson[0] as any;
          if (first.company?.name || first.companyName) {
            setCompany({ id: companyId, name: first.company?.name ?? first.companyName, deletedAt: null });
          }
        }

        // Final fallback if we truly can't resolve a name.
        setCompany(prev => prev ?? { id: companyId, name: companyId, deletedAt: null });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load organization");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [companyId]);

  // Load company tags
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    setTagsLoading(true);
    Promise.all([
      fetch(`${API_BASE}/system/companies/${companyId}/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => res.ok ? res.json() : []),
      fetch(`${API_BASE}/system/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => res.ok ? res.json() : []),
    ])
      .then(([tagsData, allTagsData]) => {
        setCompanyTags(Array.isArray(tagsData) ? tagsData : []);
        setAllTags(Array.isArray(allTagsData) ? allTagsData : []);
      })
      .catch(() => {})
      .finally(() => setTagsLoading(false));
  }, [companyId]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  // Available tags to add (not already assigned)
  const availableTags = useMemo(() => {
    const assignedIds = new Set(companyTags.map(ct => ct.systemTag.id));
    return allTags.filter(t => !assignedIds.has(t.id));
  }, [allTags, companyTags]);

  const handleAddTag = async (tagId: string) => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/system/companies/${companyId}/tags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error("Failed to add tag");
      const newTag = await res.json();
      setCompanyTags(prev => [...prev, newTag]);
      setShowAddTag(false);
    } catch (e: any) {
      alert(e?.message || "Failed to add tag");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    if (!confirm("Remove this tag from the organization?")) return;

    try {
      const res = await fetch(`${API_BASE}/system/companies/${companyId}/tags/${tagId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to remove tag");
      setCompanyTags(prev => prev.filter(ct => ct.systemTag.id !== tagId));
    } catch (e: any) {
      alert(e?.message || "Failed to remove tag");
    }
  };

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const handleDeactivateOrg = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      return;
    }
    const confirmed = window.confirm(
      "This will deactivate this organization and remove it from tenant lists. Users will no longer be able to switch into it. Continue?",
    );
    if (!confirmed) return;

    try {
      setDeactivating(true);
      setDeactivateMessage(null);
      setReactivateMessage(null);
      const res = await fetch(`${API_BASE}/admin/companies/${companyId}/deactivate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // Send an explicit empty JSON object so the backend JSON parser is satisfied.
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to deactivate organization (${res.status}) ${text}`);
      }
      setDeactivateMessage(
        "Organization deactivated. It will no longer appear in tenant lists or allow login.",
      );
      // After a brief delay, navigate back to the System overview so the org
      // disappears from the list.
      setTimeout(() => {
        window.location.href = "/system";
      }, 800);
    } catch (e: any) {
      setError(e?.message ?? "Failed to deactivate organization");
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivateOrg = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      return;
    }
    const confirmed = window.confirm(
      "This will reactivate this organization and allow it to appear in tenant lists again. Continue?",
    );
    if (!confirmed) return;

    try {
      setReactivating(true);
      setReactivateMessage(null);
      setDeactivateMessage(null);
      const res = await fetch(`${API_BASE}/admin/companies/${companyId}/reactivate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to reactivate organization (${res.status}) ${text}`);
      }
      const json = await res.json().catch(() => null);
      setCompany(prev =>
        prev
          ? {
              ...prev,
              deletedAt: null,
            }
          : json
          ? { id: json.id, name: json.name, deletedAt: json.deletedAt ?? null }
          : { id: companyId, name: companyId, deletedAt: null },
      );
      setReactivateMessage("Organization reactivated and can be used again.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to reactivate organization");
    } finally {
      setReactivating(false);
    }
  };

  // Load recent activity dashboard data when a project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setRecent(null);
      setRecentError(null);
      setRecentLoading(false);
      return;
    }

    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setRecentError("Missing access token. Please login again.");
      setRecentLoading(false);
      return;
    }

    let cancelled = false;
    setRecentLoading(true);
    setRecentError(null);

    fetch(`${API_BASE}/projects/${selectedProjectId}/recent-activities`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load recent activity (${res.status})`);
        }
        return res.json();
      })
      .then((json: any) => {
        if (cancelled) return;
        setRecent({
          dailyLogs: Array.isArray(json.dailyLogs) ? json.dailyLogs : [],
          tasks: Array.isArray(json.tasks) ? json.tasks : [],
          petlEdits: Array.isArray(json.petlEdits) ? json.petlEdits : [],
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setRecentError(e?.message ?? "Failed to load recent activity");
      })
      .finally(() => {
        if (cancelled) return;
        setRecentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const openInProjectWorkspace = async () => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setOpening(true);
      const res = await fetch(`${API_BASE}/auth/switch-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to switch company (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      if (json.accessToken && json.refreshToken && json.company?.id) {
        window.localStorage.setItem("accessToken", json.accessToken);
        window.localStorage.setItem("refreshToken", json.refreshToken);
        window.localStorage.setItem("companyId", json.company.id);
      }

      window.location.href = "/projects";
    } catch (e: any) {
      setError(e?.message ?? "Failed to open project workspace");
    } finally {
      setOpening(false);
    }
  };

  const openProjectInTenant = async (projectId: string) => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setOpeningProjectId(projectId);
      const res = await fetch(`${API_BASE}/auth/switch-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to switch company (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      if (json.accessToken && json.refreshToken && json.company?.id) {
        window.localStorage.setItem("accessToken", json.accessToken);
        window.localStorage.setItem("refreshToken", json.refreshToken);
        window.localStorage.setItem("companyId", json.company.id);
      }

      window.location.href = `/projects/${projectId}`;
    } catch (e: any) {
      setError(e?.message ?? "Failed to open project");
    } finally {
      setOpeningProjectId(null);
    }
  };

  return (
    <PageCard>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: 18 }}>
          Organization: {company?.name ?? companyId}
          {company?.deletedAt && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 999,
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
              }}
            >
              Deactivated
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setShowCompanyId(v => !v)}
          title={companyId}
          style={{
            border: "none",
            padding: 0,
            background: "transparent",
            cursor: "pointer",
            fontSize: 11,
            color: "#6b7280",
            textDecoration: "underline",
          }}
        >
          {showCompanyId ? "Hide TID" : "Show TID"}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleDeactivateOrg}
            disabled={deactivating || !!company?.deletedAt}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #fecaca",
              background: company?.deletedAt ? "#f9fafb" : "#fef2f2",
              color: "#b91c1c",
              fontSize: 11,
              cursor: deactivating || company?.deletedAt ? "default" : "pointer",
            }}
          >
            {deactivating ? "Deactivating…" : "Deactivate org"}
          </button>
          <button
            type="button"
            onClick={handleReactivateOrg}
            disabled={reactivating || !company?.deletedAt}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #bbf7d0",
              background: !company?.deletedAt ? "#f9fafb" : "#ecfdf5",
              color: "#15803d",
              fontSize: 11,
              cursor: reactivating || !company?.deletedAt ? "default" : "pointer",
            }}
          >
            {reactivating ? "Reactivating…" : "Reactivate org"}
          </button>
        </div>
      </div>
      {deactivateMessage && (
        <p
          style={{
            marginTop: 2,
            marginBottom: 6,
            fontSize: 11,
            color: "#16a34a",
          }}
        >
          {deactivateMessage}
        </p>
      )}
      {reactivateMessage && (
        <p
          style={{
            marginTop: 2,
            marginBottom: 6,
            fontSize: 11,
            color: "#16a34a",
          }}
        >
          {reactivateMessage}
        </p>
      )}
      {showCompanyId && (
        <div
          style={{
            marginTop: 2,
            marginBottom: 4,
            fontSize: 11,
            color: "#6b7280",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          }}
        >
          Tenant ID: {companyId}
        </div>
      )}

      {/* System Tags Section */}
      <div
        style={{
          marginTop: 12,
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>System Tags</span>
          <button
            type="button"
            onClick={() => setShowAddTag(v => !v)}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            + Add
          </button>
          <a
            href="/system/tags"
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#6b7280",
              textDecoration: "underline",
            }}
          >
            Manage all tags
          </a>
        </div>

        {showAddTag && availableTags.length > 0 && (
          <div
            style={{
              marginBottom: 8,
              padding: 8,
              backgroundColor: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Select a tag to add:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleAddTag(tag.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    backgroundColor: "#f3f4f6",
                    color: "#374151",
                    border: `1px solid ${tag.color || "#d1d5db"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {tag.color && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: tag.color,
                      }}
                    />
                  )}
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showAddTag && availableTags.length === 0 && (
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            All available tags are already assigned.
          </div>
        )}

        {tagsLoading ? (
          <div style={{ fontSize: 11, color: "#6b7280" }}>Loading tags...</div>
        ) : companyTags.length === 0 ? (
          <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
            No tags assigned to this organization.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {companyTags.map(ct => (
              <div
                key={ct.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  backgroundColor: "#ffffff",
                  border: `1px solid ${ct.systemTag.color || "#e5e7eb"}`,
                  borderRadius: 4,
                }}
              >
                {ct.systemTag.color && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: ct.systemTag.color,
                    }}
                  />
                )}
                <span style={{ fontWeight: 500 }}>{ct.systemTag.label}</span>
                <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                  {ct.systemTag.code}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(ct.systemTag.id)}
                  title="Remove tag"
                  style={{
                    padding: "0 2px",
                    fontSize: 12,
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Org Performance Dashboard Tiles ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
          Performance Dashboard
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 500,
              color: "#6b7280",
              background: "#f3f4f6",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            {company?.name ?? "Organization"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          {/* Work Activity */}
          <div
            style={{
              flex: "1 1 220px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "#3b82f6" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                Work Activity
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Active Jobs</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                    {sortedProjects.length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Daily Logs Today</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Open Tasks</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Completed This Week</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Analysis */}
          <div
            style={{
              flex: "1 1 220px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "#10b981" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                Financial Analysis
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Total Billed</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Outstanding</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Budget Variance</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Avg Margin</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Efficiency */}
          <div
            style={{
              flex: "1 1 220px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "#f59e0b" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                Project Efficiency
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>On Schedule</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Behind Schedule</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Ahead of Schedule</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Avg Completion</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>—</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Most Productive */}
          <div
            style={{
              flex: "1 1 280px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "#22c55e" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                Most Productive
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                Awaiting KPI module — will show top individuals by output metrics.
              </div>
            </div>
          </div>

          {/* Least Productive */}
          <div
            style={{
              flex: "1 1 280px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "#ef4444" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
                Least Productive
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                Awaiting KPI module — will show individuals needing attention.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>
          Tiles will populate with live data once the KPI module is connected.
        </div>
      </div>

      <hr style={{ margin: "0 0 16px", borderColor: "#e5e7eb" }} />

      {selectedProject && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Recent Activities – {selectedProject.name}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Snapshot of whats been happening on this job across key modules.
          </div>

          {recentLoading && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Loading recent activity…
            </div>
          )}
          {recentError && (
            <div style={{ fontSize: 12, color: "#b91c1c" }}>{recentError}</div>
          )}

          {!recentLoading && !recentError && (
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {/* Daily Logs */}
              <div
                style={{
                  flex: "1 1 220px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>Daily Logs</div>
                {recent && recent.dailyLogs.length > 0 ? (
                  <ul style={{ marginTop: 4, paddingLeft: 14, fontSize: 11 }}>
                    {recent.dailyLogs.map((log: any) => (
                      <li key={log.id} style={{ marginBottom: 2 }}>
                        <span style={{ color: "#6b7280" }}>
                          {new Date(log.logDate || log.createdAt).toLocaleDateString()}:
                        </span>{" "}
                        <span>{log.title || "Untitled log"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    No recent daily logs yet.
                  </div>
                )}
              </div>

              {/* Tasks / To-dos */}
              <div
                style={{
                  flex: "1 1 220px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>To-dos</div>
                {recent && recent.tasks.length > 0 ? (
                  <ul style={{ marginTop: 4, paddingLeft: 14, fontSize: 11 }}>
                    {recent.tasks.map((t: any) => (
                      <li key={t.id} style={{ marginBottom: 2 }}>
                        <span>[{t.status}]</span>{" "}
                        <span>{t.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    No recent tasks yet.
                  </div>
                )}
              </div>

              {/* PETL Updates */}
              <div
                style={{
                  flex: "1 1 220px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>PETL Updates</div>
                {recent && recent.petlEdits.length > 0 ? (
                  <ul style={{ marginTop: 4, paddingLeft: 14, fontSize: 11 }}>
                    {recent.petlEdits.map((c: any) => (
                      <li key={c.id} style={{ marginBottom: 2 }}>
                        <span style={{ color: "#6b7280" }}>
                          {new Date(c.effectiveAt).toLocaleDateString()}:
                        </span>{" "}
                        <span>
                          Percent changed from {c.oldValue ?? "?"}% to {c.newValue ?? "?"}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    No recent PETL edits yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Jobs in this organization: <strong>{sortedProjects.length}</strong>
            </div>
            <button
              type="button"
              onClick={openInProjectWorkspace}
              disabled={opening}
              style={{
                marginLeft: "auto",
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                background: opening ? "#e5e7eb" : "#0f172a",
                color: opening ? "#4b5563" : "#f9fafb",
                fontSize: 12,
                cursor: opening ? "default" : "pointer",
              }}
            >
              {opening ? "Opening…" : "Open in Proj Overview"}
            </button>
          </div>

          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          {sortedProjects.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>No jobs yet.</p>
          ) : (
            <div style={{ maxHeight: 520, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Job</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Location</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map(p => {
                    const isOpening = openingProjectId === p.id;
                    return (
                    <tr key={p.id}>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        <button
                          type="button"
                          onClick={() => openProjectInTenant(p.id)}
                          disabled={isOpening}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: isOpening ? "#6b7280" : "#2563eb",
                            textDecoration: "underline",
                            cursor: isOpening ? "default" : "pointer",
                            fontSize: 12,
                          }}
                          title="Open project overview"
                        >
                          {isOpening ? "Opening…" : p.name}
                        </button>
                      </td>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        {p.status}
                      </td>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageCard>
  );
}
