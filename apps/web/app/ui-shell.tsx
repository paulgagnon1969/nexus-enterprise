"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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

          <nav className="app-nav">
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
          </nav>
        </div>
        <div className="app-header-right">
          {/* User menu */}
          <div style={{ position: "relative" }}>
            <UserMenu onLogout={handleLogout} />
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}

export function PageCard({ children }: { children: ReactNode }) {
  return <div className="app-card">{children}</div>;
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = React.useState(false);

  // For now, use a static placeholder; later we can pull real user info from /users/me
  const initials = "PG";

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
            Paul Gagnon
          </div>
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
