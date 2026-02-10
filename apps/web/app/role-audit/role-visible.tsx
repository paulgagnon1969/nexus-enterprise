"use client";

import React, { type ReactNode, type CSSProperties } from "react";
import {
  ROLE_COLORS,
  ROLE_LABELS,
  useRoleAuditSafe,
  type VisibilityRole,
} from "./role-audit-context";

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

  if (!auditMode) {
    // When not in audit mode, just render children directly
    return <>{children}</>;
  }

  const colors = ROLE_COLORS[minRole];
  const roleLabel = ROLE_LABELS[minRole];
  const tooltipText = label ? `${label}: ${roleLabel}` : roleLabel;

  const baseStyles: CSSProperties = {
    background: colors.bg,
    border: `2px solid ${colors.border}`,
    borderRadius: 4,
    position: "relative",
    ...style,
  };

  const displayStyles: CSSProperties = 
    display === "inline"
      ? { display: "inline", padding: "1px 4px" }
      : display === "field"
        ? { display: "block", padding: "4px 6px" }
        : { display: "block", padding: "2px 4px" };

  return (
    <span
      style={{ ...baseStyles, ...displayStyles }}
      title={tooltipText}
      data-role-audit={minRole}
    >
      {children}
      {/* Small badge showing the role level */}
      <span
        style={{
          position: "absolute",
          top: -8,
          right: -4,
          background: colors.border,
          color: "#ffffff",
          fontSize: 8,
          fontWeight: 700,
          padding: "1px 4px",
          borderRadius: 3,
          whiteSpace: "nowrap",
          lineHeight: 1.2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      >
        {roleLabel}
      </span>
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
    return { isAuditing: false, styles: {} };
  }

  const colors = ROLE_COLORS[minRole];
  
  return {
    isAuditing: true,
    styles: {
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 4,
    } as CSSProperties,
    colors,
    label: ROLE_LABELS[minRole],
  };
}
