"use client";

import React, { useEffect, type ReactNode, type CSSProperties } from "react";
import {
  ROLE_COLORS,
  ROLE_LABELS,
  CLIENT_ROLE,
  VIEW_ROLE_TO_VISIBILITY,
  canRoleSee,
  useRoleAuditSafe,
  type VisibilityRole,
} from "./role-audit-context";
import { useViewRoleSafe } from "../view-as-role-context";
import { useFieldPoliciesSafe } from "../hooks/use-field-policies";

interface RoleVisibleProps {
  /**
   * The minimum internal role required to see this content (hardcoded fallback).
   * e.g., "PM" means PM and above can see it.
   * When `secKey` is provided, the DB policy overrides this.
   */
  minRole: VisibilityRole;

  /**
   * Optional security resource key (e.g., "project.address").
   * When set, the component fetches the DB policy and uses the DB-defined
   * minRole + client access flag instead of the hardcoded props.
   */
  secKey?: string;

  /**
   * Static fallback for client visibility (only used when secKey is NOT set).
   * Defaults to false — clients cannot see unless explicitly granted.
   */
  clientVisible?: boolean;
  
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
 * Wrapper component that controls field visibility based on role.
 * 
 * Supports two modes:
 * 1. **Static** (no `secKey`): Uses the hardcoded `minRole` prop.
 * 2. **Dynamic** (with `secKey`): Fetches the DB policy and uses that.
 *    The hardcoded `minRole` is used as a fallback until the policy loads.
 * 
 * CLIENT is always independent from the internal hierarchy.
 */
export function RoleVisible({
  minRole,
  secKey,
  clientVisible = false,
  children,
  label,
  display = "inline",
  style,
}: RoleVisibleProps) {
  const { auditMode } = useRoleAuditSafe();
  const { viewAs } = useViewRoleSafe();
  const fieldPolicies = useFieldPoliciesSafe();

  // Register this secKey so the provider fetches the policy
  useEffect(() => {
    if (secKey && fieldPolicies) {
      fieldPolicies.register(secKey);
    }
  }, [secKey, fieldPolicies]);

  // Resolve effective minRole and clientCanView from DB policy or fallback
  const dbPolicy = secKey ? fieldPolicies?.getPolicy(secKey) : null;
  const effectiveMinRole: VisibilityRole = (dbPolicy?.minRole as VisibilityRole) ?? minRole;
  const effectiveClientVisible = dbPolicy ? dbPolicy.clientCanView : clientVisible;

  // Check if we should hide this content based on viewAs role
  const mappedRole = VIEW_ROLE_TO_VISIBILITY[viewAs] ?? "ACTUAL";
  
  if (mappedRole !== "ACTUAL") {
    if (mappedRole === CLIENT_ROLE) {
      // Viewing as CLIENT — check independent client flag
      if (!effectiveClientVisible) return null;
    } else {
      // Viewing as an internal role — check hierarchy
      const canSee = canRoleSee(mappedRole as VisibilityRole, effectiveMinRole);
      if (!canSee) return null;
    }
  }

  // Compute data-sec-key for the security inspector
  const secKeyAttr = secKey ? { "data-sec-key": secKey } : {};

  if (!auditMode) {
    // When not in audit mode, just render children directly
    // Still attach data-sec-key so inspector can target it
    return secKey
      ? <span {...secKeyAttr} style={{ display: "contents" }}>{children}</span>
      : <>{children}</>;
  }

  const colors = ROLE_COLORS[effectiveMinRole];
  const roleLabel = ROLE_LABELS[effectiveMinRole];
  const clientNote = effectiveClientVisible ? " · Client ✓" : "";
  const tooltipText = label
    ? `${label}: ${roleLabel}${clientNote}`
    : `${roleLabel}${clientNote}`;

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

  const clientColors = ROLE_COLORS[CLIENT_ROLE];

  return (
    <span
      style={{ ...baseStyles, ...displayStyles }}
      title={tooltipText}
      data-role-audit={effectiveMinRole}
      {...secKeyAttr}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {/* Internal role dot */}
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
      {/* Client access indicator (orange dot when client can see) */}
      {effectiveClientVisible && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: clientColors.border,
            flexShrink: 0,
            boxShadow: `0 0 0 2px ${clientColors.bg}`,
            marginLeft: -2,
          }}
          title="Client can view"
          aria-hidden="true"
        />
      )}
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
