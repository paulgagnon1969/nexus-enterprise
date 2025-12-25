"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
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

  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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

        const [companiesRes, projectsRes] = await Promise.all([
          fetch(`${API_BASE}/admin/companies`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/admin/companies/${companyId}/projects`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!companiesRes.ok) {
          throw new Error(`Failed to load organizations (${companiesRes.status})`);
        }
        if (!projectsRes.ok) {
          throw new Error(`Failed to load jobs (${projectsRes.status})`);
        }

        const companiesJson = await companiesRes.json();
        const projectsJson = await projectsRes.json();

        const companies: CompanyDto[] = Array.isArray(companiesJson) ? companiesJson : [];
        setCompany(companies.find(c => c.id === companyId) ?? null);

        setProjects(Array.isArray(projectsJson) ? projectsJson : []);
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

  return (
    <PageCard>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>
        Organization: {company?.name ?? companyId}
      </h2>

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
