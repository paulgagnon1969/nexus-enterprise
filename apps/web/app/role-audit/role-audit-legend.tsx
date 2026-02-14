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
        border: "3px solid #0f172a",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
        padding: 20,
        minWidth: 280,
        maxWidth: 340,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "2px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a" }}>
          🔍 Role Audit
        </div>
        <button
          type="button"
          onClick={() => setAuditMode(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: 24,
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

      <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 14 }}>
        Fields show a <strong>colored dot</strong> + <strong>underline</strong>:
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ROLE_HIERARCHY.map((role) => {
          const colors = ROLE_COLORS[role];
          return (
            <div
              key={role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: colors.bg,
                borderBottom: `4px solid ${colors.border}`,
                borderRadius: 4,
                padding: "6px 10px",
              }}
            >
              <span style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: 600 }}>
                {ROLE_LABELS[role]}
              </span>
              {/* Dot indicator */}
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: colors.border,
                  flexShrink: 0,
                  boxShadow: `0 0 0 3px ${colors.bg}, 0 2px 4px rgba(0,0,0,0.2)`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "2px solid #e5e7eb",
          fontSize: 13,
          color: "#9ca3af",
          lineHeight: 1.5,
        }}
      >
        Green = visible to all • Red = restricted
      </div>
    </div>
  );
}
