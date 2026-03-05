"use client";

import { useState, useRef, useEffect } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type Props = {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  /** Max width for the button (default 180) */
  width?: number;
};

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = "All",
  width = 180,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: selected.length > 0 ? "#eef2ff" : "#fff",
          fontSize: 12,
          cursor: "pointer",
          width,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </span>
        <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            marginTop: 2,
            minWidth: width,
            maxHeight: 260,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
            padding: 4,
          }}
        >
          {/* Clear all */}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                border: "none",
                background: "none",
                fontSize: 11,
                color: "#6b7280",
                cursor: "pointer",
                textAlign: "left",
                borderBottom: "1px solid #f3f4f6",
                marginBottom: 2,
              }}
            >
              ✕ Clear all
            </button>
          )}
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  background: checked ? "#eef2ff" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!checked)
                    (e.currentTarget as HTMLElement).style.background =
                      "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = checked
                    ? "#eef2ff"
                    : "transparent";
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.value)}
                  style={{ margin: 0 }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
