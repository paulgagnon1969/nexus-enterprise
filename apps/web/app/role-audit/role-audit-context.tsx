"use client";

import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/**
 * Internal role hierarchy from lowest (most permissive) to highest (most restrictive).
 * "CREW" is the most open internal role; "SUPER_ADMIN" is the most restricted.
 * CLIENT is intentionally excluded — it's an independent access flag.
 */
export const ROLE_HIERARCHY = [
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

/** CLIENT is a standalone access flag — not part of the internal hierarchy. */
export const CLIENT_ROLE = "CLIENT" as const;
export type ClientRole = typeof CLIENT_ROLE;

/** Union of all role codes including CLIENT (for view-as-role etc). */
export type AnyRole = VisibilityRole | ClientRole;

/**
 * Map ViewRole (from view-as-role switcher) to VisibilityRole or CLIENT for filtering.
 * ACTUAL means use the user's real permissions (no filtering).
 * CLIENT maps to "CLIENT" — handled separately from the internal hierarchy.
 */
export const VIEW_ROLE_TO_VISIBILITY: Record<string, VisibilityRole | "CLIENT" | "ACTUAL"> = {
  ACTUAL: "ACTUAL",
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  EXECUTIVE: "EXECUTIVE",
  PM: "PM",
  SUPER: "SUPER",
  FOREMAN: "FOREMAN",
  CREW: "CREW",
  CLIENT: "CLIENT",
};

/**
 * Check if a given visibility role can see content requiring minRole.
 * Returns true if currentRole >= minRole in the hierarchy.
 */
export function canRoleSee(currentRole: VisibilityRole, minRole: VisibilityRole): boolean {
  const currentIndex = ROLE_HIERARCHY.indexOf(currentRole);
  const minIndex = ROLE_HIERARCHY.indexOf(minRole);
  return currentIndex >= minIndex;
}

/**
 * Color scheme for internal role visibility - green (open) to red (restricted).
 * CLIENT has its own color (orange) since it's independent.
 */
export const ROLE_COLORS: Record<VisibilityRole | ClientRole, { bg: string; border: string; text: string }> = {
  CREW: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },        // Emerald - most open internal
  FOREMAN: { bg: "#cffafe", border: "#06b6d4", text: "#0e7490" },     // Cyan
  SUPER: { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },       // Blue
  PM: { bg: "#e0e7ff", border: "#6366f1", text: "#4338ca" },          // Indigo
  EXECUTIVE: { bg: "#ede9fe", border: "#8b5cf6", text: "#6d28d9" },   // Violet
  ADMIN: { bg: "#fce7f3", border: "#ec4899", text: "#be185d" },       // Pink
  OWNER: { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c" },       // Red
  SUPER_ADMIN: { bg: "#18181b", border: "#fbbf24", text: "#fbbf24" }, // Black/Gold - Nexus Superuser
  CLIENT: { bg: "#fff7ed", border: "#f97316", text: "#c2410c" },      // Orange - independent
};

export const ROLE_LABELS: Record<VisibilityRole | ClientRole, string> = {
  CREW: "Crew+",
  FOREMAN: "Foreman+",
  SUPER: "Super+",
  PM: "PM+",
  EXECUTIVE: "Exec+",
  ADMIN: "Admin+",
  OWNER: "Owner+",
  SUPER_ADMIN: "⚡ Superuser",
  CLIENT: "Client (independent)",
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
