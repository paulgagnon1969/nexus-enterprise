"use client";

import React, { type ReactNode, type CSSProperties } from "react";
import {
  ROLE_COLORS,
  ROLE_LABELS,
  VIEW_ROLE_TO_VISIBILITY,
  canRoleSee,
  useRoleAuditSafe,
  type VisibilityRole,
} from "./role-audit-context";
import { useViewRoleSafe } from "../view-as-role-context";

interface RoleVisibleProps {
  /**
   * The minimum role required to see this content.
   * e.g., "PM" means PM and above can see it.
   */
  minRole: VisibilityRole;
  
  /**
   * The content to wrap. In audit mode, it will be highlighted.
   */
  children: ReactNode;
  
  /**
   * Optional label to show in the tooltip (defaults to field detection).
   */
  label?: string;
  
  /**
   * Display mode for the wrapper.
   * - "inline" for text/values within a line
   * - "block" for sections/cards
   * - "field" for form fields (adds padding)
   */
  display?: "inline" | "block" | "field";
  
  /**
   * Additional styles to apply to the wrapper.
   */
  style?: CSSProperties;
}

/**
 * Wrapper component that highlights content based on role visibility in audit mode.
 * 
 * Usage:
 * ```tsx
 * <RoleVisible minRole="PM">
 *   <span>Sensitive financial data</span>
 * </RoleVisible>
 * ```
 */
export function RoleVisible({
  minRole,
  children,
  label,
  display = "inline",
  style,
}: RoleVisibleProps) {
  const { auditMode } = useRoleAuditSafe();
  const { viewAs } = useViewRoleSafe();

  // Check if we should hide this content based on viewAs role
  const mappedRole = VIEW_ROLE_TO_VISIBILITY[viewAs] ?? "ACTUAL";
  
  if (mappedRole !== "ACTUAL") {
    // We're simulating a different role - check if it can see this content
    const canSee = canRoleSee(mappedRole as VisibilityRole, minRole);
    if (!canSee) {
      // Hide the content entirely when viewing as a role that can't see it
      return null;
    }
  }

  if (!auditMode) {
    // When not in audit mode, just render children directly
    return <>{children}</>;
  }

  const colors = ROLE_COLORS[minRole];
  const roleLabel = ROLE_LABELS[minRole];
  const tooltipText = label ? `${label}: ${roleLabel}` : roleLabel;

  const baseStyles: CSSProperties = {
    background: colors.bg,
    borderBottom: `4px solid ${colors.border}`,
    borderRadius: 4,
    position: "relative",
    ...style,
  };

  const displayStyles: CSSProperties = 
    display === "inline"
      ? { display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px" }
      : display === "field"
        ? { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }
        : { display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" };

  return (
    <span
      style={{ ...baseStyles, ...displayStyles }}
      title={tooltipText}
      data-role-audit={minRole}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {/* Colored dot indicator - always visible at right side */}
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: colors.border,
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${colors.bg}, 0 2px 4px rgba(0,0,0,0.2)`,
        }}
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * Hook to get audit highlight styles for custom implementations.
 * Useful when you can't use the RoleVisible wrapper.
 */
export function useRoleAuditStyles(minRole: VisibilityRole) {
  const { auditMode } = useRoleAuditSafe();

  if (!auditMode) {
    return { isAuditing: false, styles: {}, dotStyles: {} };
  }

  const colors = ROLE_COLORS[minRole];
  
  return {
    isAuditing: true,
    styles: {
      background: colors.bg,
      borderBottom: `4px solid ${colors.border}`,
      borderRadius: 4,
    } as CSSProperties,
    // Styles for the colored dot indicator
    dotStyles: {
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: colors.border,
      flexShrink: 0,
      boxShadow: `0 0 0 3px ${colors.bg}, 0 2px 4px rgba(0,0,0,0.2)`,
    } as CSSProperties,
    colors,
    label: ROLE_LABELS[minRole],
  };
}
