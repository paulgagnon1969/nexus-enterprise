"use client";

import { ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyDto {
  id: string;
  name: string;
  createdAt?: string;
}

interface MeDto {
  globalRole?: string;
}

interface OrgProjectSummary {
  id: string;
  name: string;
  status?: string;
}

function SystemLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showNewOrg, setShowNewOrg] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTemplate, setNewOrgTemplate] = useState("BLANK");
  const [newOrgError, setNewOrgError] = useState<string | null>(null);

  const [orgProjects, setOrgProjects] = useState<OrgProjectSummary[]>([]);
  const [orgProjectsLoading, setOrgProjectsLoading] = useState(false);
  const [orgProjectsError, setOrgProjectsError] = useState<string | null>(null);

  function getTokenOrThrow() {
    const t = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!t) throw new Error("Missing access token. Please login again.");
    return t;
  }

  async function reloadCompanies() {
    const token = getTokenOrThrow();

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/admin/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load organizations (${res.status})`);
      }
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  async function createCompany(name: string) {
    const token = getTokenOrThrow();

    const res = await fetch(`${API_BASE}/companies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Create organization failed (${res.status}) ${text}`);
    }

    return (await res.json()) as CompanyDto;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      setIsSuperAdmin(false);
      return;
    }

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((me: MeDto | null) => {
        const ok = me?.globalRole === "SUPER_ADMIN";
        setIsSuperAdmin(ok);
        if (!ok) {
          window.location.href = "/projects";
        }
      })
      .catch(() => {
        setIsSuperAdmin(false);
        window.location.href = "/projects";
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSuperAdmin !== true) return;

    void reloadCompanies();
  }, [isSuperAdmin]);

  const isActiveCompany = (id: string) => pathname?.startsWith(`/system/${id}`);
  const isOverview = pathname === "/system";

  const path = pathname ?? "";
  const selectedCompanyId = path.startsWith("/system/")
    ? path.split("/")[2] ?? null
    : null;
  const selectedProjectId = searchParams.get("projectId");

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? companies.filter(c => c.name.toLowerCase().includes(q))
      : companies;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search]);

  // Load projects for the selected organization (middle sidebar)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedCompanyId) {
      setOrgProjects([]);
      setOrgProjectsError(null);
      setOrgProjectsLoading(false);
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setOrgProjectsError("Missing access token. Please login again.");
      setOrgProjectsLoading(false);
      return;
    }

    let cancelled = false;
    setOrgProjectsLoading(true);
    setOrgProjectsError(null);

    fetch(`${API_BASE}/admin/companies/${selectedCompanyId}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load jobs (${res.status})`);
        }
        return res.json();
      })
      .then((json: any) => {
        if (cancelled) return;
        setOrgProjects(Array.isArray(json) ? json : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setOrgProjectsError(e?.message ?? "Failed to load jobs");
      })
      .finally(() => {
        if (cancelled) return;
        setOrgProjectsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const handleCreateOrg = async () => {
    setNewOrgError(null);

    const name = newOrgName.trim();
    if (!name) {
      setNewOrgError("Organization name is required.");
      return;
    }

    try {
      setCreatingOrg(true);

      // NOTE: template wiring is coming next. For now we create a plain Company.
      // newOrgTemplate is kept so we can thread it through once templates exist.
      void newOrgTemplate;

      const created = await createCompany(name);
      await reloadCompanies();

      setShowNewOrg(false);
      setNewOrgName("");
      setNewOrgTemplate("BLANK");

      window.location.href = `/system/${created.id}`;
    } catch (e: any) {
      setNewOrgError(e?.message ?? "Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  };

  return (
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 16,
          minHeight: "calc(100vh - 79px)",
        }}
      >
      {/* Left sidebar: organizations list */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRadius: 6,
          background: "#ffffff",
          border: "1px solid #0f172a",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 79px)",
        }}
      >
        <div
          style={{
            marginBottom: 6,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
              Organizations
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Nexus System overview
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewOrgError(null);
              setShowNewOrg(true);
            }}
            style={{
              borderRadius: 4,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              padding: "6px 8px",
              cursor: "pointer",
              lineHeight: 1,
            }}
            title="Create organization"
          >
            +
          </button>
        </div>

        <div style={{ marginBottom: 6 }}>
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          />
        </div>

        <Link
          href="/system/templates"
          style={{
            margin: "0 -8px 6px",
            fontSize: 12,
            padding: "6px 12px",
            display: "block",
            textDecoration: "none",
            background: pathname?.startsWith("/system/templates") ? "#f3f4f6" : "#ffffff",
            color: "#0f172a",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          SORM — Templates
        </Link>

        <Link
          href="/system"
          style={{
            margin: "0 -8px 6px",
            fontSize: 12,
            padding: "6px 12px",
            display: "block",
            textDecoration: "none",
            backgroundColor: isOverview ? "#bfdbfe" : "#ffffff",
            color: "#0f172a",
            fontWeight: 600,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Organizations: {visibleCompanies.length}
        </Link>

        {loading ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: "#f97316" }}>{error}</div>
        ) : visibleCompanies.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>No organizations yet.</div>
        ) : (
          <div style={{ overflowY: "auto", paddingRight: 0, flex: 1 }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visibleCompanies.map(c => {
                const active = isActiveCompany(c.id);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/system/${c.id}`}
                      style={{
                        display: "block",
                        margin: "0 -8px 4px",
                        padding: "6px 12px",
                        textDecoration: "none",
                        fontSize: 12,
                        color: active ? "#0f172a" : "#111827",
                        backgroundColor: active ? "#bfdbfe" : "transparent",
                      }}
                      title={c.name}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.name}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>

      {/* Middle sidebar: projects for selected organization */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRadius: 6,
          background: "#ffffff",
          border: "1px solid #0f172a",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 79px)",
        }}
      >
        <div
          style={{
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
            Projects
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Jobs in selected organization
          </div>
        </div>

        {!selectedCompanyId ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Select an organization to see its jobs.
          </div>
        ) : orgProjectsLoading ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</div>
        ) : orgProjectsError ? (
          <div style={{ fontSize: 12, color: "#f97316" }}>{orgProjectsError}</div>
        ) : orgProjects.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>No jobs yet.</div>
        ) : (
          <div
            style={{
              overflowY: "auto",
              paddingRight: 0,
              flex: 1,
            }}
          >
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {orgProjects
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(p => {
                  const active = selectedCompanyId && selectedProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/system/${selectedCompanyId}?projectId=${p.id}`}
                        style={{
                          display: "block",
                          margin: "0 -8px 4px",
                          padding: "6px 12px",
                          fontSize: 12,
                          textDecoration: "none",
                          borderBottom: "1px solid #e5e7eb",
                          color: active ? "#0f172a" : "#111827",
                          backgroundColor: active ? "#bfdbfe" : "transparent",
                        }}
                      >
                        <div
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.name}
                        </div>
                        {p.status && (
                          <div style={{ fontSize: 11, color: "#6b7280" }}>
                            {p.status}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </aside>

      {/* Right pane */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/* Superuser banner inside System frame (SUPER_ADMIN only) */}
        {isSuperAdmin && (
          <div
            style={{
              marginBottom: 8,
              padding: "6px 12px",
              borderRadius: 6,
              background: "#0f172a",
              color: "#f9fafb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {visibleCompanies.length > 0 && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginRight: 8,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#e5e7eb" }}>Organization:</span>
                  <select
                    value={selectedCompanyId ?? ""}
                    onChange={e => {
                      const nextId = e.target.value;
                      if (!nextId) return;
                      router.push(`/system/${nextId}`);
                    }}
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                      backgroundColor: "#0f172a",
                      color: "#f9fafb",
                    }}
                  >
                    {visibleCompanies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 600 }}>Superuser menu</div>
                <div style={{ fontSize: 11, color: "#e5e7eb" }}>
                  System-level tools for managing all organizations
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Link
                href="/system/nex-net"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: pathname?.startsWith("/system/nex-net") ? "#f9fafb" : "transparent",
                  color: pathname?.startsWith("/system/nex-net") ? "#0f172a" : "#f9fafb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                Nex-Net
              </Link>
              <Link
                href="/system"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: pathname === "/system" ? "#f9fafb" : "transparent",
                  color: pathname === "/system" ? "#0f172a" : "#f9fafb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                System
              </Link>
              <Link
                href="/system/templates"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: pathname?.startsWith("/system/templates")
                    ? "#f9fafb"
                    : "transparent",
                  color: pathname?.startsWith("/system/templates") ? "#0f172a" : "#f9fafb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                Templates
              </Link>
              <Link
                href="/system/embedded/ncc-landing"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: pathname?.startsWith("/system/embedded/ncc-landing")
                    ? "#f9fafb"
                    : "transparent",
                  color: pathname?.startsWith("/system/embedded/ncc-landing") ? "#0f172a" : "#f9fafb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                NCC landing
              </Link>
              <Link
                href="/system/embedded/ncc-landing#worker-registration"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: pathname?.startsWith("/system/embedded/ncc-landing")
                    ? "#f9fafb"
                    : "transparent",
                  color: pathname?.startsWith("/system/embedded/ncc-landing") ? "#0f172a" : "#f9fafb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                Worker registration landing
              </Link>
            </div>
          </div>
        )}

        {/* Tenant workspace menu under the Superuser frame */}
        <div
          style={{
            marginBottom: 12,
            padding: "6px 10px",
            borderRadius: 6,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600, color: "#0f172a" }}>
            Tenant workspace:
          </span>
          <Link
            href="/projects"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Proj Overview
          </Link>
          <Link
            href="/project-management"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Project Management
          </Link>
          <Link
            href="/files"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Files
          </Link>
          <Link
            href="/messaging"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Messaging
          </Link>
          <Link
            href="/financial"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Financial
          </Link>
          <Link
            href="/reports"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Reports
          </Link>
          <Link
            href="/company/trades"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            People · Trades
          </Link>
          <Link
            href="/system/nex-net"
            target="_self"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Nex-Net
          </Link>
          <Link
            href="/company/users?tab=candidates"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "#111827" }}
          >
            Prospective People
          </Link>
        </div>

        {children}

        {showNewOrg && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 20,
            }}
          >
            <div
              className="app-card"
              style={{
                width: 420,
                maxWidth: "90vw",
                padding: 16,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  New Organization
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNewOrg(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ display: "block", marginBottom: 4 }}>
                  Organization name
                </span>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Demo Restoration Co"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ display: "block", marginBottom: 4 }}>
                  Template (coming next)
                </span>
                <select
                  value={newOrgTemplate}
                  onChange={e => setNewOrgTemplate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                    background: "#ffffff",
                  }}
                >
                  <option value="BLANK">Blank organization</option>
                  <option value="NFS_DEFAULT">NFS default (placeholder)</option>
                </select>
                <div style={{ marginTop: 4, color: "#6b7280" }}>
                  Template selection will control module access + default settings.
                </div>
              </label>

              {newOrgError && (
                <div style={{ color: "#b91c1c", marginBottom: 10 }}>{newOrgError}</div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowNewOrg(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateOrg}
                  disabled={creatingOrg}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: creatingOrg ? "#e5e7eb" : "#2563eb",
                    color: creatingOrg ? "#4b5563" : "#f9fafb",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: creatingOrg ? "default" : "pointer",
                  }}
                >
                  {creatingOrg ? "Creating…" : "Create organization"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 16, fontSize: 13 }}>
          Loading system view…
        </div>
      }
    >
      <SystemLayoutInner>{children}</SystemLayoutInner>
    </Suspense>
  );
}
