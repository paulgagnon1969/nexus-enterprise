"use client";

import * as React from "react";
import { useState, useMemo, useCallback } from "react";

interface PetlItem {
  id: string;
  lineNo: number;
  sourceLineNo?: number | null;
  description: string | null;
  qty: number | null;
  unit: string | null;
  itemAmount: number | null;
  rcvAmount: number | null;
  activity: string | null;
  categoryCode: string | null;
  selectionCode: string | null;
  projectParticle?: {
    id: string;
    name: string;
    fullLabel: string;
  } | null;
}

interface SourceEntry {
  kind: string;
  tag: string;
  description: string;
  note: string;
  unitCost: number;
  unit: string;
  categoryCode: string;
  selectionCode: string;
}

interface ReconBatchPasteModalProps {
  source: SourceEntry;
  petlItems: PetlItem[];
  reconEntriesBySowItemId: Map<string, any[]>;
  projectId: string;
  apiBase: string;
  onClose: () => void;
  onSuccess: () => void;
}

const formatMoney = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReconBatchPasteModal({
  source,
  petlItems,
  reconEntriesBySowItemId,
  projectId,
  apiBase,
  onClose,
  onSuccess,
}: ReconBatchPasteModalProps) {
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [showMode, setShowMode] = useState<"has-recon" | "all">("has-recon");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number } | null>(null);

  // Unique activities for the filter dropdown
  const activities = useMemo(() => {
    const set = new Set<string>();
    for (const item of petlItems) {
      if (item.activity) set.add(item.activity);
    }
    return Array.from(set).sort();
  }, [petlItems]);

  // Filtered PETL items
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return petlItems.filter((item) => {
      // Recon filter: default shows only lines that already have recon
      const hasRecon = (reconEntriesBySowItemId.get(item.id) ?? []).length > 0;
      if (showMode === "has-recon" && !hasRecon) return false;
      // Activity filter
      if (activityFilter && item.activity !== activityFilter) return false;
      // Text search on description
      if (q) {
        const desc = (item.description ?? "").toLowerCase();
        if (!desc.includes(q)) return false;
      }
      return true;
    });
  }, [petlItems, search, activityFilter, showMode, reconEntriesBySowItemId]);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) {
        next.add(item.id);
      }
      return next;
    });
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handlePaste = async () => {
    if (selected.size === 0) return;
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token.");
      return;
    }
    setPasting(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/projects/${projectId}/petl/reconciliation/batch-paste`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sourceEntry: {
              kind: source.kind,
              tag: source.tag || null,
              description: source.description || null,
              note: source.note || null,
              unitCost: source.unitCost,
              unit: source.unit || null,
              categoryCode: source.categoryCode || null,
              selectionCode: source.selectionCode || null,
            },
            targetSowItemIds: Array.from(selected),
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Paste failed (${res.status}) ${text}`);
      }
      const json = await res.json().catch(() => ({}));
      setResult({ created: json?.created ?? selected.size });
    } catch (err: any) {
      setError(err?.message ?? "Failed to paste entries.");
    } finally {
      setPasting(false);
    }
  };

  // If paste succeeded, show summary and close button
  if (result) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.3)",
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: 24,
            maxWidth: 420,
            width: "90%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a", marginBottom: 12 }}>
            ✓ Pasted {result.created} entries
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Unit cost ${formatMoney(source.unitCost)} applied to {result.created} lines.
            Each line's qty was used to calculate its total.
          </div>
          <button
            type="button"
            onClick={() => {
              onSuccess();
              onClose();
            }}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        background: "rgba(0,0,0,0.3)",
        padding: "60px 12px 12px 12px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 12,
          maxWidth: 900,
          width: "100%",
          maxHeight: "calc(100vh - 90px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Copy to Similar Lines</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Select target PETL lines to paste this reconciliation entry
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Source summary */}
        <div
          style={{
            padding: "10px 16px",
            background: "#f5f3ff",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: "#5b21b6", marginBottom: 4 }}>
            Source entry
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>
              <strong>Kind:</strong> {source.kind}
            </span>
            <span>
              <strong>Unit cost:</strong> ${formatMoney(source.unitCost)}
            </span>
            {source.tag && (
              <span>
                <strong>Tag:</strong> {source.tag}
              </span>
            )}
            {source.description && (
              <span>
                <strong>Desc:</strong>{" "}
                {source.description.length > 60
                  ? source.description.slice(0, 60) + "…"
                  : source.description}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description…"
            style={{
              flex: 1,
              minWidth: 180,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          />
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All activities</option>
            {activities.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={showMode}
            onChange={(e) => setShowMode(e.target.value as "has-recon" | "all")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="has-recon">Has recon only</option>
            <option value="all">All lines</option>
          </select>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={deselectAll}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Clear
          </button>
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            {filtered.length} lines shown · {selected.size} selected
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 0" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              minWidth: 700,
            }}
          >
            <thead>
              <tr style={{ background: "#f9fafb", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ textAlign: "center", padding: "6px 8px", width: 36 }}></th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 60 }}>Line</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 80 }}>Activity</th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 100 }}>Location</th>
                <th style={{ textAlign: "right", padding: "6px 8px", width: 60 }}>Qty</th>
                <th style={{ textAlign: "right", padding: "6px 8px", width: 100 }}>
                  Projected
                </th>
                <th style={{ textAlign: "center", padding: "6px 8px", width: 60 }}>Recon?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const hasRecon =
                  (reconEntriesBySowItemId.get(item.id) ?? []).length > 0;
                const isChecked = selected.has(item.id);
                const targetQty = item.qty ?? 1;
                const projected = source.unitCost * targetQty;
                const displayLineNo =
                  item.sourceLineNo && item.sourceLineNo > 0
                    ? item.sourceLineNo
                    : item.lineNo;

                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    style={{
                      cursor: "pointer",
                      background: isChecked
                        ? "#ede9fe"
                        : "transparent",
                    }}
                  >
                    <td
                      style={{
                        textAlign: "center",
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        fontFamily: "monospace",
                        color: "#4b5563",
                      }}
                    >
                      {displayLineNo}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.description ?? ""}
                    >
                      {item.description ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        color: "#6b7280",
                      }}
                    >
                      {item.activity ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        color: "#6b7280",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.projectParticle?.fullLabel ?? ""}
                    >
                      {item.projectParticle?.name ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {targetQty}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                        fontWeight: isChecked ? 600 : 400,
                        color: isChecked ? "#5b21b6" : "#111827",
                      }}
                    >
                      ${formatMoney(projected)}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "center",
                      }}
                    >
                      {hasRecon ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          ✓
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    No matching PETL lines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 12 }}>
            {selected.size > 0 && (
              <span style={{ color: "#5b21b6", fontWeight: 600 }}>
                Total projected:{" "}
                $
                {formatMoney(
                  Array.from(selected).reduce((sum, id) => {
                    const item = petlItems.find((p) => p.id === id);
                    return sum + source.unitCost * (item?.qty ?? 1);
                  }, 0),
                )}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {error && (
              <span style={{ color: "#b91c1c", fontSize: 12, alignSelf: "center" }}>
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePaste}
              disabled={selected.size === 0 || pasting}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #5b21b6",
                background: selected.size > 0 ? "#7c3aed" : "#d1d5db",
                color: "#ffffff",
                cursor: selected.size > 0 ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 600,
                opacity: pasting ? 0.7 : 1,
              }}
            >
              {pasting
                ? "Pasting…"
                : `Paste to ${selected.size} line${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
