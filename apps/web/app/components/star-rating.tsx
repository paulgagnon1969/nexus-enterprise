"use client";

import React from "react";

const NEXUS_DARK_BLUE = "#0f172a";
const NEXUS_GOLD = "#facc15";

export default function StarRating({
  value,
  onChange,
  size = 18,
  readOnly = false,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange?: (next: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const current = value ?? 0;

  return (
    <div
      role={readOnly ? "img" : "group"}
      aria-label={ariaLabel}
      style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
    >
      {Array.from({ length: 5 }, (_, idx) => {
        const starValue = (idx + 1) as 1 | 2 | 3 | 4 | 5;
        const active = current >= starValue;

        const svg = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: "block" }}
          >
            <path
              d="M12 2.5l2.47 5.01 5.53.8-4 3.9.94 5.49L12 15.9l-4.94 2.8.94-5.49-4-3.9 5.53-.8L12 2.5z"
              fill={active ? NEXUS_GOLD : "#ffffff"}
              stroke={NEXUS_DARK_BLUE}
              strokeWidth={1}
            />
          </svg>
        );

        if (readOnly || !onChange) {
          return <span key={starValue}>{svg}</span>;
        }

        return (
          <button
            key={starValue}
            type="button"
            onClick={() => onChange(starValue)}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              lineHeight: 0,
            }}
            aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
          >
            {svg}
          </button>
        );
      })}
    </div>
  );
}
