"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ROLE_HIERARCHY,
  ROLE_COLORS,
  ROLE_LABELS,
  CLIENT_ROLE,
  useRoleAuditSafe,
} from "./role-audit-context";

const STORAGE_KEY = "nexus-role-audit-legend-pos";

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { x, y } = JSON.parse(raw);
    return typeof x === "number" && typeof y === "number" ? { x, y } : null;
  } catch {
    return null;
  }
}

/**
 * Floating, draggable legend that shows when Role Audit mode is active.
 * Displays the color key for each internal visibility level + client note.
 * Position persists in localStorage across navigations.
 */
export function RoleAuditLegend() {
  const { auditMode, setAuditMode } = useRoleAuditSafe();
  const cardRef = useRef<HTMLDivElement>(null);

  // Position state (null = use default top-right)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // Load saved position on mount
  useEffect(() => {
    setPos(loadSavedPosition());
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from the header area
    const el = cardRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const x = e.clientX - dragOffset.current.dx;
      const y = e.clientY - dragOffset.current.dy;
      setPos({ x, y });
    };

    const onUp = () => {
      setDragging(false);
      // Persist position
      setPos((cur) => {
        if (cur) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cur)); } catch {}
        }
        return cur;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  if (!auditMode) return null;

  const clientColors = ROLE_COLORS[CLIENT_ROLE];

  // Position: use saved, or default top-right
  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { top: 80, right: 16 };

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        zIndex: 9999,
        background: "#ffffff",
        border: "3px solid #0f172a",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
        padding: 20,
        minWidth: 280,
        maxWidth: 340,
        userSelect: dragging ? "none" : undefined,
        ...posStyle,
      }}
    >
      {/* Draggable header */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "2px solid #e5e7eb",
          cursor: dragging ? "grabbing" : "grab",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a" }}>
          🔍 Role Audit
        </div>
        <button
          type="button"
          onClick={() => setAuditMode(false)}
          onMouseDown={(e) => e.stopPropagation()}
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

      {/* Internal hierarchy */}
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

      {/* Client (independent) */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "2px solid #f97316",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: clientColors.bg,
            borderBottom: `4px solid ${clientColors.border}`,
            borderRadius: 4,
            padding: "6px 10px",
          }}
        >
          <span style={{ flex: 1, fontSize: 15, color: clientColors.text, fontWeight: 600 }}>
            {ROLE_LABELS[CLIENT_ROLE]}
          </span>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: clientColors.border,
              flexShrink: 0,
              boxShadow: `0 0 0 3px ${clientColors.bg}, 0 2px 4px rgba(0,0,0,0.2)`,
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          Client access is configured independently per field.
        </div>
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
        Green = most open • Red = most restricted • Drag header to move
      </div>
    </div>
  );
}
