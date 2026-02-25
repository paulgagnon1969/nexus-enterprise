"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ---------- Types ----------

interface HelpItem {
  id: string;
  helpKey: string;
  title: string;
  brief: string;
  sopId?: string | null;
  sopSection?: string | null;
  videoUrl?: string | null;
}

interface MarkerPosition {
  key: string;
  x: number;
  y: number;
  element: HTMLElement;
}

interface Props {
  onClose: () => void;
}

// ---------- Popover Component ----------

function HelpPopover({
  item,
  position,
  onClose,
}: {
  item: HelpItem;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep popover on screen
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Keep on screen horizontally
    if (x + rect.width > viewportWidth - 16) {
      x = viewportWidth - rect.width - 16;
    }
    if (x < 16) x = 16;

    // Keep on screen vertically
    if (y + rect.height > viewportHeight - 16) {
      y = position.y - rect.height - 40; // Show above marker
    }
    if (y < 16) y = 16;

    setAdjustedPos({ x, y });
  }, [position]);

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 10002,
        background: "#ffffff",
        borderRadius: 8,
        padding: 16,
        width: 280,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        border: "1px solid #e5e7eb",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "none",
          border: "none",
          fontSize: 16,
          cursor: "pointer",
          color: "#6b7280",
          padding: "2px 6px",
        }}
      >
        ✕
      </button>

      <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, paddingRight: 24 }}>
        {item.title}
      </h3>

      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
        {item.brief}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {item.sopId && (
          <button
            type="button"
            onClick={() => {
              // Open SOP viewer - for now, navigate to document
              window.open(`/system/documents/${item.sopId}`, "_blank");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            📖 View SOP
          </button>
        )}

        {item.videoUrl && (
          <button
            type="button"
            onClick={() => {
              window.open(item.videoUrl!, "_blank");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #059669",
              background: "#ecfdf5",
              color: "#047857",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ▶️ Watch Video
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Help Overlay ----------

export function HelpOverlay({ onClose }: Props) {
  const [markers, setMarkers] = useState<MarkerPosition[]>([]);
  const [helpItems, setHelpItems] = useState<Map<string, HelpItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activePopover, setActivePopover] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  // Scan DOM for data-help attributes and fetch content
  useEffect(() => {
    const elements = document.querySelectorAll("[data-help]");
    const foundMarkers: MarkerPosition[] = [];
    const keys: string[] = [];

    elements.forEach((el) => {
      const key = el.getAttribute("data-help");
      if (!key) return;

      const rect = el.getBoundingClientRect();
      foundMarkers.push({
        key,
        x: rect.right + 4,
        y: rect.top + rect.height / 2 - 12,
        element: el as HTMLElement,
      });
      keys.push(key);
    });

    setMarkers(foundMarkers);

    // Fetch help content from API
    if (keys.length > 0) {
      fetch(`${API_BASE}/help-items/by-keys?keys=${keys.join(",")}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((items: HelpItem[]) => {
          const map = new Map<string, HelpItem>();
          items.forEach((item) => map.set(item.helpKey, item));
          setHelpItems(map);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Handle escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePopover) {
          setActivePopover(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, activePopover]);

  const handleMarkerClick = useCallback((marker: MarkerPosition) => {
    setActivePopover({
      key: marker.key,
      x: marker.x + 30,
      y: marker.y,
    });
  }, []);

  return (
    <div
      onClick={() => {
        if (activePopover) {
          setActivePopover(null);
        } else {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0, 0, 0, 0.3)",
        cursor: "pointer",
      }}
    >
      {/* Exit button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10001,
          padding: "10px 24px",
          borderRadius: 999,
          border: "none",
          background: "#1f2937",
          color: "#f9fafb",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>✕</span> Exit Help Mode
      </button>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#f9fafb",
            fontSize: 14,
          }}
        >
          Loading help content...
        </div>
      )}

      {/* No help items message */}
      {!loading && markers.length === 0 && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#ffffff",
            padding: "24px 32px",
            borderRadius: 8,
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
          <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
            No help items available on this page yet.
          </p>
        </div>
      )}

      {/* Help markers */}
      {markers.map((marker) => {
        const item = helpItems.get(marker.key);
        const isActive = activePopover?.key === marker.key;

        return (
          <button
            key={marker.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleMarkerClick(marker);
            }}
            title={item?.title || marker.key}
            style={{
              position: "fixed",
              left: marker.x,
              top: marker.y,
              zIndex: 10001,
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "2px solid #3b82f6",
              background: isActive ? "#3b82f6" : "#ffffff",
              color: isActive ? "#ffffff" : "#3b82f6",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
              transition: "all 0.15s ease",
              animation: !isActive ? "pulse 2s infinite" : "none",
            }}
          >
            ?
          </button>
        );
      })}

      {/* Active popover */}
      {activePopover && helpItems.get(activePopover.key) && (
        <HelpPopover
          item={helpItems.get(activePopover.key)!}
          position={{ x: activePopover.x, y: activePopover.y }}
          onClose={() => setActivePopover(null)}
        />
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
