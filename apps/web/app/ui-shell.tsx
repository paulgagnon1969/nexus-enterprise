"use client";

import React, { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavDropdown from "./components/nav-dropdown";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface UserMeResponse {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  globalRole?: string;
  userType?: string;
  memberships: {
    companyId: string;
    role: string;
    company: {
      id: string;
      name: string;
    };
  }[];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);

  const path = pathname ?? "/";
  const isAuthRoute = path === "/login" || path.startsWith("/accept-invite");
  const isPublicRoute =
    path === "/apply" ||
    path.startsWith("/apply/") ||
    path.startsWith("/onboarding/") ||
    path === "/reset-password" ||
    path.startsWith("/reset-password/");


  // On first load in this browser tab, clear any stale tokens and send the
  // user to the login screen, so deep links don't silently use expired auth.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Public routes (recruiting / onboarding) should never force logout.
    if (isPublicRoute) return;

    const alreadyHandled = window.sessionStorage.getItem("nexusInitialLogoutDone");
    if (alreadyHandled === "1") return;

    // Mark as handled so we only do this once per tab session.
    window.sessionStorage.setItem("nexusInitialLogoutDone", "1");

    if (!isAuthRoute) {
      window.localStorage.removeItem("accessToken");
      window.localStorage.removeItem("refreshToken");
      window.localStorage.removeItem("companyId");
      window.location.href = "/login";
    }
  }, [isAuthRoute, isPublicRoute]);

  const handleLogout = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("companyId");
    window.location.href = "/login";
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  if (isPublicRoute) {
    return (
      <main style={{ minHeight: "100vh", background: "#ffffff" }}>{children}</main>
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((json: UserMeResponse | null) => {
        if (!json) return;
        setGlobalRole(json.globalRole ?? null);
        setUserType(json.userType ?? null);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const noMainScroll =
    // Pages that manage their own internal scroll panes
    path.startsWith("/company/users/") ||
    path === "/settings/skills";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <img
              src="/nexus-logo-mark.png"
              alt="Nexus Fortified Structures logo"
              className="app-logo-img"
            />
            <div className="app-logo-text">
              <div className="app-logo-title">NEXUS</div>
              <div className="app-logo-subtitle">Fortified Structures</div>
            </div>
          </div>

          {/* Company switcher (hide for applicant pool accounts) */}
          {userType !== "APPLICANT" && (
            <div style={{ marginLeft: 16, marginRight: 8 }}>
              <CompanySwitcher />
            </div>
          )}

          <nav className="app-nav">
            {globalRole === "SUPER_ADMIN" && (
              <Link
                href="/system"
                className={
                  "app-nav-link" +
                  (isActive("/system") ? " app-nav-link-active" : "")
                }
              >
                Nexus System
              </Link>
            )}

            {userType === "APPLICANT" ? (
              <Link
                href="/candidate"
                className={
                  "app-nav-link" +
                  (isActive("/candidate") ? " app-nav-link-active" : "")
                }
              >
                Candidate
              </Link>
            ) : (
              <>
                {/* Proj Overview = main project workspace (current /projects section) */}
                <Link
                  href="/projects"
                  className={
                    "app-nav-link" +
                    (isActive("/projects") ? " app-nav-link-active" : "")
                  }
                >
                  Proj Overview
                </Link>

            {/* Placeholder tabs matching Buildertrend-style menu (without Sales) */}
            <Link
              href="/project-management"
              className={
                "app-nav-link" +
                (isActive("/project-management") ? " app-nav-link-active" : "")
              }
            >
              Project Management
            </Link>
            <Link
              href="/files"
              className={
                "app-nav-link" +
                (isActive("/files") ? " app-nav-link-active" : "")
              }
            >
              Files
            </Link>
            <Link
              href="/messaging"
              className={
                "app-nav-link" +
                (isActive("/messaging") ? " app-nav-link-active" : "")
              }
            >
              Messaging
            </Link>
            <Link
              href="/financial"
              className={
                "app-nav-link" +
                (isActive("/financial") ? " app-nav-link-active" : "")
              }
            >
              Financial
            </Link>
            <Link
              href="/reports"
              className={
                "app-nav-link" +
                (isActive("/reports") ? " app-nav-link-active" : "")
              }
            >
              Reports
            </Link>
            <NavDropdown
              label="People"
              active={path.startsWith("/company/")}
              items={[
                { label: "Worker Profiles", href: "/company/users" },
                { label: "Prospective Candidates", href: "/company/users?tab=candidates" },
                { label: "Open Trades Profile", href: "/company/trades" },
                { label: "Client Profiles", href: "/company/clients" },
              ]}
            />
              </>
            )}
          </nav>
        </div>
        <div className="app-header-right">
          {/* User menu */}
          <div style={{ position: "relative" }}>
            <UserMenu onLogout={handleLogout} />
          </div>
        </div>
      </header>
      <main className="app-main" style={noMainScroll ? { overflow: "hidden" } : undefined}>
        {children}
      </main>
    </div>
  );
}

export function PageCard({ children }: { children: ReactNode }) {
  return <div className="app-card">{children}</div>;
}

function CompanySwitcher() {
  const [memberships, setMemberships] = useState<UserMeResponse["memberships"]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    setCurrentCompanyId(window.localStorage.getItem("companyId"));

    setLoading(true);
    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(async (json: UserMeResponse | null) => {
        if (!json) return;

        const membershipCompanies = Array.isArray(json.memberships)
          ? json.memberships.map(m => ({
              id: m.companyId,
              name: m.company?.name ?? m.companyId,
            }))
          : [];

        setMemberships(json.memberships ?? []);

        let visibleCompanies = membershipCompanies;

        // SUPER_ADMIN should see all organizations, even if they weren't the creator.
        if (json.globalRole === "SUPER_ADMIN") {
          try {
            const adminRes = await fetch(`${API_BASE}/admin/companies`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (adminRes.ok) {
              const all = await adminRes.json();
              if (Array.isArray(all) && all.length) {
                visibleCompanies = all.map((c: any) => ({
                  id: c.id,
                  name: c.name ?? c.id,
                }));
              }
            }
          } catch {
            // fall back to membershipCompanies on error
          }
        }

        setCompanies(visibleCompanies);

        // If no companyId in localStorage, default to the first visible company.
        if (!window.localStorage.getItem("companyId") && visibleCompanies[0]) {
          const firstId = visibleCompanies[0].id;
          window.localStorage.setItem("companyId", firstId);
          setCurrentCompanyId(firstId);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading && !companies.length) {
    return (
      <span style={{ fontSize: 11, color: "#6b7280" }}>Loading companies…</span>
    );
  }

  if (!companies.length || !currentCompanyId) {
    return null;
  }

  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = async (e) => {
    const nextCompanyId = e.target.value;
    if (!nextCompanyId || nextCompanyId === currentCompanyId) return;
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setSwitching(true);
      const res = await fetch(`${API_BASE}/auth/switch-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId: nextCompanyId }),
      });
      if (!res.ok) {
        // Soft-fail; keep current company
        return;
      }
      const json: any = await res.json();
      if (json.accessToken && json.refreshToken && json.company?.id) {
        window.localStorage.setItem("accessToken", json.accessToken);
        window.localStorage.setItem("refreshToken", json.refreshToken);
        window.localStorage.setItem("companyId", json.company.id);
        setCurrentCompanyId(json.company.id);
        // Reload app context under new company
        window.location.href = "/projects";
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      <span style={{ color: "#6b7280" }}>Company:</span>
      <select
        value={currentCompanyId ?? ""}
        onChange={handleChange}
        disabled={switching}
        style={{
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 11,
          backgroundColor: switching ? "#e5e7eb" : "#ffffff",
        }}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function getUserInitials(me: UserMeResponse | null) {
  const first = me?.firstName?.trim() ?? "";
  const last = me?.lastName?.trim() ?? "";

  const a = first[0];
  const b = last[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();

  // Fallback: derive something stable from email.
  const localPart = (me?.email ?? "").split("@")[0] ?? "";
  const parts = localPart.split(/[._\s-]+/).filter(Boolean);
  const e1 = parts[0]?.[0];
  const e2 = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];

  const out = `${e1 ?? "U"}${e2 ?? ""}`.toUpperCase();
  return out.length >= 2 ? out.slice(0, 2) : out;
}

function getUserDisplayName(me: UserMeResponse | null) {
  const first = me?.firstName?.trim();
  const last = me?.lastName?.trim();
  const full = [first, last].filter(Boolean).join(" ");
  return full || me?.email || "Account";
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [me, setMe] = React.useState<UserMeResponse | null>(null);
  const [canManageCompany, setCanManageCompany] = React.useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    const currentCompanyId = window.localStorage.getItem("companyId");

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((json: UserMeResponse | null) => {
        if (!json) return;
        setMe(json);

        const isSuperAdmin = (json.globalRole ?? null) === "SUPER_ADMIN";
        let canManage = isSuperAdmin;
        if (currentCompanyId && Array.isArray(json.memberships) && json.memberships.length) {
          const membership = json.memberships.find(m => m.companyId === currentCompanyId);
          if (membership) {
            const role = membership.role;
            if (role === "OWNER" || role === "ADMIN") {
              canManage = true;
            }
          }
        }
        setCanManageCompany(!!canManage);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const initials = getUserInitials(me);
  const displayName = getUserDisplayName(me);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {initials}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            marginTop: 8,
            minWidth: 200,
            background: "#ffffff",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(15,23,42,0.16)",
            border: "1px solid #e5e7eb",
            padding: 8,
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "6px 8px",
              fontSize: 13,
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
              marginBottom: 4,
            }}
          >
            {displayName}
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/profile";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            See/Edit Profile
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/roles";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Roles &amp; Permissions
          </button>

          {canManageCompany && (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/settings/company";
              }}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Company settings
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/skills";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            My skills matrix
          </button>
          <button
            type="button"
            onClick={onLogout}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
