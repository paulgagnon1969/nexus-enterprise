"use client";

import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/**
 * Role hierarchy from lowest (most permissive) to highest (most restrictive).
 * "CLIENT" means everyone including clients can see it.
 * "SUPER_ADMIN" means only Nexus Superusers can see it.
 */
export const ROLE_HIERARCHY = [
  "CLIENT",
  "CREW",
  "FOREMAN",
  "SUPER",
  "PM",
  "EXECUTIVE",
  "ADMIN",
  "OWNER",
  "SUPER_ADMIN",
] as const;

export type VisibilityRole = (typeof ROLE_HIERARCHY)[number];

/**
 * Color scheme for role visibility - progresses from green (open) to red (restricted)
 */
export const ROLE_COLORS: Record<VisibilityRole, { bg: string; border: string; text: string }> = {
  CLIENT: { bg: "#dcfce7", border: "#22c55e", text: "#166534" },      // Green - most open
  CREW: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },        // Emerald
  FOREMAN: { bg: "#cffafe", border: "#06b6d4", text: "#0e7490" },     // Cyan
  SUPER: { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },       // Blue
  PM: { bg: "#e0e7ff", border: "#6366f1", text: "#4338ca" },          // Indigo
  EXECUTIVE: { bg: "#ede9fe", border: "#8b5cf6", text: "#6d28d9" },   // Violet
  ADMIN: { bg: "#fce7f3", border: "#ec4899", text: "#be185d" },       // Pink
  OWNER: { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c" },       // Red
  SUPER_ADMIN: { bg: "#18181b", border: "#fbbf24", text: "#fbbf24" }, // Black/Gold - Nexus Superuser
};

export const ROLE_LABELS: Record<VisibilityRole, string> = {
  CLIENT: "Client+",
  CREW: "Crew+",
  FOREMAN: "Foreman+",
  SUPER: "Super+",
  PM: "PM+",
  EXECUTIVE: "Executive+",
  ADMIN: "Admin+",
  OWNER: "Owner Only",
  SUPER_ADMIN: "⚡ Nexus Superuser",
};

interface RoleAuditContextValue {
  auditMode: boolean;
  setAuditMode: (enabled: boolean) => void;
  toggleAuditMode: () => void;
}

const RoleAuditContext = createContext<RoleAuditContextValue | null>(null);

export function RoleAuditProvider({ children }: { children: ReactNode }) {
  const [auditMode, setAuditMode] = useState(false);

  const toggleAuditMode = useCallback(() => {
    setAuditMode((prev) => !prev);
  }, []);

  return (
    <RoleAuditContext.Provider value={{ auditMode, setAuditMode, toggleAuditMode }}>
      {children}
    </RoleAuditContext.Provider>
  );
}

export function useRoleAudit() {
  const ctx = useContext(RoleAuditContext);
  if (!ctx) {
    throw new Error("useRoleAudit must be used within RoleAuditProvider");
  }
  return ctx;
}

/**
 * Safe version that returns defaults if outside provider (for gradual adoption)
 */
export function useRoleAuditSafe() {
  const ctx = useContext(RoleAuditContext);
  return ctx ?? { auditMode: false, setAuditMode: () => {}, toggleAuditMode: () => {} };
}
