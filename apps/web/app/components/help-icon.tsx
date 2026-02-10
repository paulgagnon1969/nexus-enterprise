"use client";

import React, { useState } from "react";
import { SopViewerModal } from "./sop-viewer-modal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: string;
  created: string;
  updated: string;
  author: string;
  featureId?: string;
}

interface SopResponse {
  filename: string;
  frontmatter: SopFrontmatter;
  content: string;
}

interface HelpIconProps {
  /** The feature ID that maps to an SOP document */
  featureId: string;
  /** Optional custom tooltip text */
  tooltip?: string;
  /** Optional size in pixels (default: 16) */
  size?: number;
}

export function HelpIcon({ featureId, tooltip, size = 16 }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const [sop, setSop] = useState<SopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    // If we already have the SOP loaded, just open the modal
    if (sop) {
      setOpen(true);
      return;
    }

    // Fetch the SOP
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/sops/by-feature/${encodeURIComponent(featureId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("No help documentation found for this feature.");
        } else {
          setError("Failed to load help documentation.");
        }
        return;
      }

      const data: SopResponse = await res.json();
      setSop(data);
      setOpen(true);
    } catch (e) {
      setError("Network error loading help documentation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={tooltip || "Click for help"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          color: "#6b7280",
          fontSize: size * 0.65,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          padding: 0,
          verticalAlign: "middle",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#e5e7eb";
          e.currentTarget.style.color = "#374151";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f9fafb";
          e.currentTarget.style.color = "#6b7280";
        }}
        aria-label="Help"
      >
        {loading ? "…" : "?"}
      </button>

      {error && (
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: "#b91c1c",
          }}
        >
          {error}
        </span>
      )}

      {open && sop && (
        <SopViewerModal
          frontmatter={sop.frontmatter}
          content={sop.content}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
