"use client";

import React from "react";
import {
  ROLE_HIERARCHY,
  ROLE_COLORS,
  ROLE_LABELS,
  useRoleAuditSafe,
} from "./role-audit-context";

/**
 * Floating legend that shows when Role Audit mode is active.
 * Displays the color key for each visibility level.
 */
export function RoleAuditLegend() {
  const { auditMode, setAuditMode } = useRoleAuditSafe();

  if (!auditMode) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 16,
        zIndex: 9999,
        background: "#ffffff",
        border: "2px solid #0f172a",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        padding: 12,
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
          🔍 Role Audit
        </div>
        <button
          type="button"
          onClick={() => setAuditMode(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: 16,
            cursor: "pointer",
            color: "#6b7280",
            padding: 0,
            lineHeight: 1,
          }}
          title="Close Role Audit"
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 8 }}>
        Fields are highlighted by minimum visibility level:
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ROLE_HIERARCHY.map((role) => {
          const colors = ROLE_COLORS[role];
          return (
            <div
              key={role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: colors.text, fontWeight: 500 }}>
                {ROLE_LABELS[role]}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid #e5e7eb",
          fontSize: 9,
          color: "#9ca3af",
          lineHeight: 1.4,
        }}
      >
        Green = visible to all • Red = restricted
      </div>
    </div>
  );
}
