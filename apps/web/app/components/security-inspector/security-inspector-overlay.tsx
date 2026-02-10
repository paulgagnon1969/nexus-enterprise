"use client";

import React, { useEffect, useRef } from "react";
import {
  useSecurityInspectorSafe,
  FIELD_SECURITY_ROLE_HIERARCHY,
  type FieldSecurityRoleCode,
} from "./security-inspector-context";

const ROLE_LABELS: Record<FieldSecurityRoleCode, string> = {
  CLIENT: "Client",
  CREW: "Crew",
  FOREMAN: "Foreman",
  SUPER: "Super",
  PM: "PM",
  EXECUTIVE: "Executive",
  ADMIN: "Admin",
  OWNER: "Owner",
  SUPER_ADMIN: "Superuser",
};

const ROLE_COLORS: Record<FieldSecurityRoleCode, string> = {
  CLIENT: "#22c55e",
  CREW: "#10b981",
  FOREMAN: "#06b6d4",
  SUPER: "#3b82f6",
  PM: "#6366f1",
  EXECUTIVE: "#8b5cf6",
  ADMIN: "#ec4899",
  OWNER: "#ef4444",
  SUPER_ADMIN: "#fbbf24",
};

export function SecurityInspectorOverlay() {
  const {
    isEnabled,
    isOpen,
    target,
    policy,
    loading,
    error,
    roleInfo,
    closeInspector,
    updatePermission,
    savePolicy,
    hasUnsavedChanges,
    saving,
  } = useSecurityInspectorSafe();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Position the overlay near the target element
  useEffect(() => {
    if (!isOpen || !target || !overlayRef.current) return;

    const overlay = overlayRef.current;
    const rect = target.rect;

    // Position below the target element, or above if not enough space
    const viewportHeight = window.innerHeight;
    const overlayHeight = 400; // Approximate height

    let top = rect.bottom + 8;
    if (top + overlayHeight > viewportHeight) {
      top = rect.top - overlayHeight - 8;
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, viewportHeight - overlayHeight - 8));

    let left = rect.left;
    const overlayWidth = 420;
    if (left + overlayWidth > window.innerWidth) {
      left = window.innerWidth - overlayWidth - 8;
    }
    left = Math.max(8, left);

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
  }, [isOpen, target]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeInspector();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeInspector]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        closeInspector();
      }
    };

    // Delay to prevent immediate close from the right-click that opened it
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
    };
  }, [isOpen, closeInspector]);

  if (!isEnabled || !isOpen) return null;

  const canModifySet = new Set(roleInfo?.canModify ?? []);

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        zIndex: 99999,
        width: 420,
        maxHeight: "80vh",
        overflow: "auto",
        backgroundColor: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        border: "1px solid #e5e7eb",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500, letterSpacing: 0.5 }}>
              🔒 SECURITY INSPECTOR
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#111827",
                marginTop: 2,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {target?.resourceKey ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={closeInspector}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              color: "#9ca3af",
              padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {roleInfo && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
            Your role:{" "}
            <span style={{ color: ROLE_COLORS[roleInfo.userRole], fontWeight: 600 }}>
              {ROLE_LABELS[roleInfo.userRole]}
            </span>
            {policy?.isDefault && (
              <span style={{ marginLeft: 8, color: "#f59e0b" }}>(default policy)</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>Loading…</div>
        ) : error ? (
          <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</div>
        ) : null}

        {policy && (
          <>
            {/* Permission Matrix */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "8px 4px", fontWeight: 600 }}>Role</th>
                  <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 60 }}>
                    View
                  </th>
                  <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 60 }}>
                    Edit
                  </th>
                  <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 60 }}>
                    Export
                  </th>
                </tr>
              </thead>
              <tbody>
                {FIELD_SECURITY_ROLE_HIERARCHY.map((roleCode) => {
                  const perm = policy.permissions.find((p) => p.roleCode === roleCode);
                  const canModify = canModifySet.has(roleCode);
                  const isUserRole = roleInfo?.userRole === roleCode;

                  return (
                    <tr
                      key={roleCode}
                      style={{
                        backgroundColor: isUserRole ? "#f0f9ff" : undefined,
                        opacity: canModify ? 1 : 0.5,
                      }}
                    >
                      <td style={{ padding: "6px 4px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: ROLE_COLORS[roleCode],
                            }}
                          />
                          <span style={{ fontWeight: isUserRole ? 600 : 400 }}>
                            {ROLE_LABELS[roleCode]}
                          </span>
                          {isUserRole && (
                            <span style={{ fontSize: 10, color: "#3b82f6" }}>(you)</span>
                          )}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", padding: "6px 4px" }}>
                        <input
                          type="checkbox"
                          checked={perm?.canView ?? true}
                          disabled={!canModify}
                          onChange={(e) => updatePermission(roleCode, "canView", e.target.checked)}
                          style={{ cursor: canModify ? "pointer" : "not-allowed" }}
                        />
                      </td>
                      <td style={{ textAlign: "center", padding: "6px 4px" }}>
                        <input
                          type="checkbox"
                          checked={perm?.canEdit ?? false}
                          disabled={!canModify}
                          onChange={(e) => updatePermission(roleCode, "canEdit", e.target.checked)}
                          style={{ cursor: canModify ? "pointer" : "not-allowed" }}
                        />
                      </td>
                      <td style={{ textAlign: "center", padding: "6px 4px" }}>
                        <input
                          type="checkbox"
                          checked={perm?.canExport ?? true}
                          disabled={!canModify}
                          onChange={(e) => updatePermission(roleCode, "canExport", e.target.checked)}
                          style={{ cursor: canModify ? "pointer" : "not-allowed" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Help text */}
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
              {canModifySet.size > 0 ? (
                <>You can modify permissions for roles up to {ROLE_LABELS[roleInfo?.userRole ?? "CLIENT"]}.</>
              ) : (
                <>Read-only view. Upgrade to Admin+ to edit policies.</>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {policy && canModifySet.size > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            borderRadius: "0 0 12px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {hasUnsavedChanges ? (
              <span style={{ color: "#f59e0b" }}>● Unsaved changes</span>
            ) : (
              <span>No changes</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={closeInspector}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "#ffffff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePolicy}
              disabled={!hasUnsavedChanges || saving}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "none",
                borderRadius: 6,
                backgroundColor: hasUnsavedChanges ? "#2563eb" : "#9ca3af",
                color: "#ffffff",
                cursor: hasUnsavedChanges && !saving ? "pointer" : "not-allowed",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
