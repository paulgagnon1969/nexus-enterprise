"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyDto {
  id: string;
  name: string;
}

interface ProjectDto {
  id: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
  createdAt: string;
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
  const [showCompanyId, setShowCompanyId] = useState(false);

  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{
    dailyLogs: any[];
    tasks: any[];
    petlEdits: any[];
  } | null>(null);

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
                setCompany({ id: companyId, name: match.name });
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
            setCompany({ id: companyId, name: first.company?.name ?? first.companyName });
          }
        }

        // Final fallback if we truly can't resolve a name.
        setCompany(prev => prev ?? { id: companyId, name: companyId });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load organization");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [companyId]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

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

      // Open tenant project workspace in a new tab so the System view (with
      // tenant + projects sidebars) remains visible in this tab.
      window.open("/projects", "_blank");
    } catch (e: any) {
      setError(e?.message ?? "Failed to open project workspace");
    } finally {
      setOpening(false);
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
      </div>
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
                  {sortedProjects.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        {p.name}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageCard>
  );
}
