"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyDto {
  id: string;
  name: string;
  createdAt?: string;
}

interface MeDto {
  globalRole?: string;
}

export default function SystemLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? companies.filter(c => c.name.toLowerCase().includes(q))
      : companies;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search]);

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

      {/* Right pane */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
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
