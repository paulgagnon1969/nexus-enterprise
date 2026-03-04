"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_COLUMNS, type ColumnDef } from "./RawDataTable";

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadColumnPrefs(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveColumnPrefs(storageKey: string, columns: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(columns));
  } catch {}
}

// ---------------------------------------------------------------------------
// Default visible columns (consolidated view)
// ---------------------------------------------------------------------------

const DEFAULT_VISIBLE = [
  "date",
  "source",
  "description",
  "merchant",
  "amount",
  "category",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ColumnCustomizerProps = {
  /** localStorage key for persisting column preferences */
  storageKey: string;
  /** Current visible columns */
  visibleColumns: string[];
  /** Callback when visible columns change */
  onChange: (columns: string[]) => void;
};

export function ColumnCustomizer({ storageKey, visibleColumns, onChange }: ColumnCustomizerProps) {
  const [open, setOpen] = useState(false);

  const toggleColumn = useCallback(
    (key: string) => {
      let next: string[];
      if (visibleColumns.includes(key)) {
        next = visibleColumns.filter((k) => k !== key);
      } else {
        // Insert at the end
        next = [...visibleColumns, key];
      }
      onChange(next);
      saveColumnPrefs(storageKey, next);
    },
    [visibleColumns, onChange, storageKey],
  );

  const resetToDefault = useCallback(() => {
    onChange(DEFAULT_VISIBLE);
    saveColumnPrefs(storageKey, DEFAULT_VISIBLE);
  }, [onChange, storageKey]);

  const selectAll = useCallback(() => {
    const all = ALL_COLUMNS.map((c) => c.key);
    onChange(all);
    saveColumnPrefs(storageKey, all);
  }, [onChange, storageKey]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: open ? "#eff6ff" : "#ffffff",
          color: "#374151",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ⚙ Customize Columns
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            zIndex: 100,
            width: 280,
            maxHeight: 400,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #f3f4f6",
              marginBottom: 4,
            }}
          >
            <button
              onClick={resetToDefault}
              style={{
                border: "none",
                background: "none",
                color: "#2563eb",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Reset Default
            </button>
            <button
              onClick={selectAll}
              style={{
                border: "none",
                background: "none",
                color: "#2563eb",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Select All
            </button>
          </div>

          {ALL_COLUMNS.map((col) => (
            <label
              key={col.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#374151",
              }}
            >
              <input
                type="checkbox"
                checked={visibleColumns.includes(col.key)}
                onChange={() => toggleColumn(col.key)}
                style={{ margin: 0 }}
              />
              <span>{col.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>
                {getSourceBadge(col.key)}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Which source each column belongs to (for the badge in the customizer)
function getSourceBadge(key: string): string {
  const hdKeys = ["storeNumber", "transactionRef", "registerNumber", "jobNameRaw", "jobName", "sku", "qty", "unitPrice", "department", "subcategory", "purchaser"];
  const chaseKeys = ["txnType", "runningBalance", "checkOrSlip", "postingDate"];
  const appleKeys = ["clearingDate", "cardCategory", "cardHolder"];

  if (hdKeys.includes(key)) return "HD";
  if (chaseKeys.includes(key)) return "Chase";
  if (appleKeys.includes(key)) return "Apple";
  return "All";
}

// Hook for using column customizer state
export function useColumnPrefs(storageKey: string) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE);

  useEffect(() => {
    const saved = loadColumnPrefs(storageKey);
    if (saved) setVisibleColumns(saved);
  }, [storageKey]);

  return { visibleColumns, setVisibleColumns };
}
