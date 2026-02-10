"use client";

import { useEffect, useState } from "react";
import { useViewRole, ViewRole } from "./view-as-role-context";
import { useRoleAuditSafe } from "./role-audit";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MeResponse {
  id: string;
  email: string;
  memberships: {
    companyId: string;
    role: string;
    company: { id: string; name: string };
  }[];
  globalRole?: string;
}

export function ViewRoleSwitcher() {
  const { viewAs, setViewAs } = useViewRole();
  const { auditMode, toggleAuditMode } = useRoleAuditSafe();
  const [open, setOpen] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState<ViewRole[]>(["ACTUAL"]);
  const [snapshotState, setSnapshotState] = useState<
    { status: "idle" | "running" | "success" | "error"; message?: string }
  >({ status: "idle" });
  const [canFreezeDev, setCanFreezeDev] = useState(false);
  const [canRoleAudit, setCanRoleAudit] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const companyId = typeof window !== "undefined" ? localStorage.getItem("companyId") : null;
    if (!token || !companyId) return;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data: MeResponse = await res.json();

        const membership = data.memberships.find(m => m.companyId === companyId);
        const companyRole = membership?.role || "MEMBER";
        const globalRole = data.globalRole || "NONE";

        const roles: ViewRole[] = ["ACTUAL"];

        const isOwner = companyRole === "OWNER";
        const isAdmin = companyRole === "ADMIN";

        // Freeze Dev is allowed only for SUPER_ADMIN or company OWNER
        const canFreeze = globalRole === "SUPER_ADMIN" || isOwner;
        
        // Role Audit is allowed for ADMIN and above
        const canAudit = globalRole === "SUPER_ADMIN" || isOwner || isAdmin;
        setCanRoleAudit(canAudit);

        if (globalRole === "SUPER_ADMIN" || isOwner) {
          roles.push("OWNER", "ADMIN", "MEMBER", "CLIENT");
        } else if (isAdmin) {
          roles.push("ADMIN", "MEMBER", "CLIENT");
        } else if (companyRole === "MEMBER") {
          roles.push("MEMBER", "CLIENT");
        } else if (companyRole === "CLIENT") {
          roles.push("CLIENT");
        }

        setAllowedRoles(Array.from(new Set(roles)));
        setCanFreezeDev(canFreeze);
      } catch {
        // ignore in UI helper
      }
    }

    load();
  }, []);

  if (allowedRoles.length <= 1) return null;

  const handleFreezeSnapshot = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setSnapshotState({ status: "error", message: "No access token; please log in again." });
      return;
    }

    try {
      setSnapshotState({ status: "running" });
      const res = await fetch(`${API_BASE}/dev/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          label: `dev-snapshot`,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setSnapshotState({
          status: "error",
          message: `Failed to create snapshot (${res.status} ${text})`,
        });
        return;
      }
      const json = await res.json();
      setSnapshotState({
        status: "success",
        message: `Snapshot requested: ${json.snapshotId ?? "ok"}`,
      });
    } catch (e: any) {
      setSnapshotState({ status: "error", message: e?.message ?? "Snapshot failed" });
    }
  };

  const labelFor = (role: ViewRole): string => {
    switch (role) {
      case "ACTUAL":
        return "Actual";
      case "OWNER":
        return "Owner";
      case "ADMIN":
        return "Admin";
      case "MEMBER":
        return "Member";
      case "CLIENT":
        return "Client";
      default:
        return role;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "4rem", // Raised to avoid Next.js dev indicator
        left: "1rem",
        zIndex: 50,
        fontSize: 12,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {/* Nexus-style subtle icon */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid #38bdf8",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
        title="View as role"
      >
        <img
          src="/nexconnect-logo.png"
          alt="NexConnect view-as role"
          style={{ width: 24, height: 24, objectFit: "contain" }}
        />
      </button>

      {open && (
        <div
          style={{
            padding: 8,
            background: "#020617",
            border: "1px solid #1e293b",
            borderRadius: 4,
            minWidth: 200,
          }}
        >
      <div style={{ marginBottom: 4, fontWeight: 600, color: "#f9fafb" }}>View as</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {allowedRoles.map(role => (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => setViewAs(role)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "2px 4px",
                    marginBottom: 2,
                    border: "none",
                    background:
                      role === viewAs ? "#38bdf8" : "transparent",
                    color: role === viewAs ? "#020617" : "#f9fafb",
                    cursor: "pointer",
                    borderRadius: 3
                  }}
                >
                  {labelFor(role)}
                </button>
              </li>
            ))}
          </ul>

          {canRoleAudit && (
            <div
              style={{
                borderTop: "1px solid #1e293b",
                marginTop: 8,
                paddingTop: 6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#f9fafb" }}>
                🔍 Role Audit
              </div>
              <button
                type="button"
                onClick={toggleAuditMode}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: auditMode ? "1px solid #22c55e" : "1px solid #6b7280",
                  background: auditMode ? "#166534" : "#020617",
                  color: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                {auditMode ? "✓ Audit Mode ON" : "Enable Audit Mode"}
              </button>
              <div style={{ marginTop: 4, fontSize: 10, color: "#9ca3af" }}>
                Highlights fields by visibility level
              </div>
            </div>
          )}

          {canFreezeDev && (
            <div
              style={{
                borderTop: "1px solid #1e293b",
                marginTop: 8,
                paddingTop: 6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#f9fafb" }}>
                Freeze dev version
              </div>
            <button
              type="button"
              onClick={handleFreezeSnapshot}
              style={{
                width: "100%",
                padding: "4px 6px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid #38bdf8",
                background:
                  snapshotState.status === "running" ? "#0f172a" : "#020617",
                color: "#f9fafb",
                cursor: snapshotState.status === "running" ? "default" : "pointer",
                opacity: snapshotState.status === "running" ? 0.6 : 1,
              }}
              disabled={snapshotState.status === "running"}
            >
              {snapshotState.status === "running" ? "Creating snapshot…" : "Create dev snapshot"}
            </button>
            {snapshotState.status === "success" && (
              <div style={{ marginTop: 4, color: "#22c55e" }}>
                {snapshotState.message || "Snapshot requested"}
              </div>
            )}
            {snapshotState.status === "error" && (
              <div style={{ marginTop: 4, color: "#f97316" }}>
                {snapshotState.message || "Snapshot failed"}
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
}
