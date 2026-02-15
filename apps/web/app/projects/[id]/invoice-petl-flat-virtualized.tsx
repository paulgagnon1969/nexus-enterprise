"use client";

import * as React from "react";
import { memo, useCallback, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";

interface InvoicePetlLine {
  id: string;
  sowItemId?: string;
  kind: string;
  displayLineNo?: string | number | null;
  lineNoSnapshot?: number | null;
  sourceLineNoSnapshot?: number | null;
  categoryCodeSnapshot?: string | null;
  selectionCodeSnapshot?: string | null;
  descriptionSnapshot?: string | null;
  projectParticleLabelSnapshot?: string | null;
  projectUnitLabelSnapshot?: string | null;
  projectBuildingLabelSnapshot?: string | null;
  percentCompleteSnapshot?: number | null;
  earnedTotal?: number | null;
  prevBilledTotal?: number | null;
  thisInvTotal?: number | null;
  contractTotal?: number | null;
  billingTag?: string | null;
  parentLineId?: string | null;
}

interface InvoicePetlFlatVirtualizedTableProps {
  lines: InvoicePetlLine[];
  editingLineId: string | null;
  editDraft: string;
  editSaving: boolean;
  onStartEdit: (lineId: string, currentTag: string) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (lineId: string) => void;
  onCancelEdit: () => void;
  formatMoney: (value: any) => string;
  formatBillingTag: (tag: string) => string;
  getLineBackground: (line: InvoicePetlLine) => string;
  getEffectiveTag: (line: InvoicePetlLine) => string;
  containerHeight: number;
}

const ROW_HEIGHT = 42;

interface VirtualizedRowProps {
  sortedLines: InvoicePetlLine[];
  editingLineId: string | null;
  editDraft: string;
  editSaving: boolean;
  onStartEdit: (lineId: string, currentTag: string) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (lineId: string) => void;
  onCancelEdit: () => void;
  formatMoney: (value: any) => string;
  formatBillingTag: (tag: string) => string;
  getLineBackground: (line: InvoicePetlLine) => string;
  getEffectiveTag: (line: InvoicePetlLine) => string;
}

function VirtualizedFlatRow({
  index,
  style,
  sortedLines,
  editingLineId,
  editDraft,
  editSaving,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  formatMoney,
  formatBillingTag,
  getLineBackground,
  getEffectiveTag,
}: RowComponentProps<VirtualizedRowProps>): React.ReactElement | null {
  const li = sortedLines[index];
  if (!li) return null;

  const isCredit = li.kind === "ACV_HOLDBACK_CREDIT";
  const cat = String(li.categoryCodeSnapshot ?? "").trim();
  const sel = String(li.selectionCodeSnapshot ?? "").trim();
  const task = String(li.descriptionSnapshot ?? "").trim();
  const lineNoValue =
    li.displayLineNo != null && String(li.displayLineNo).trim()
      ? String(li.displayLineNo).trim()
      : li.lineNoSnapshot != null
        ? String(li.lineNoSnapshot)
        : "";

  const label = isCredit
    ? "↳ ACV rebate (80%)"
    : `${lineNoValue}${cat || sel ? ` · ${cat}${sel ? `/${sel}` : ""}` : ""}${task ? ` · ${task}` : ""}`;

  const effectiveTag = getEffectiveTag(li);
  const tagLabel = formatBillingTag(effectiveTag);
  const canEditTag = !isCredit && !li.parentLineId;
  const isEditingTag = canEditTag && editingLineId === li.id;
  const rowBg = getLineBackground(li);

  // Check for rejected supplement
  const isRejectedSupplement =
    effectiveTag === "SUPPLEMENT" &&
    Number(li.thisInvTotal ?? 0) === 0 &&
    Number(li.contractTotal ?? 0) !== 0;

  return (
    <div style={{ ...style, display: "flex", alignItems: "stretch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "auto" }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <tbody>
          <tr style={{ background: rowBg }}>
            {/* Estimate Line Item */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span
                  style={{
                    paddingLeft: isCredit ? 18 : 0,
                    color: isCredit ? "#b91c1c" : "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={label}
                >
                  {label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {tagLabel && !isEditingTag && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tagLabel}
                    </span>
                  )}
                  {canEditTag && !isEditingTag && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit(li.id, String(li.billingTag ?? "NONE") || "NONE");
                      }}
                      style={{
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        cursor: "pointer",
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {isEditingTag && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <select
                        value={editDraft}
                        onChange={(e) => onEditDraftChange(e.target.value)}
                        disabled={editSaving}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 11,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="NONE">—</option>
                        <option value="PETL_LINE_ITEM">PETL Line Item</option>
                        <option value="CHANGE_ORDER">Change Order</option>
                        <option value="SUPPLEMENT">Supplement</option>
                        <option value="WARRANTY">Warranty</option>
                      </select>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveEdit(li.id);
                        }}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "1px solid #0f172a",
                          background: "#0f172a",
                          color: "#f9fafb",
                          fontSize: 11,
                          cursor: editSaving ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelEdit();
                        }}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          fontSize: 11,
                          cursor: editSaving ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </td>
            {/* Room */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {li.projectParticleLabelSnapshot ?? ""}
            </td>
            {/* Unit */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {li.projectUnitLabelSnapshot ?? ""}
            </td>
            {/* Building */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {li.projectBuildingLabelSnapshot ?? ""}
            </td>
            {/* % */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
              {li.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—"}
            </td>
            {/* Earned */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
              {formatMoney(li.earnedTotal)}
            </td>
            {/* Prev billed */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
              {formatMoney(li.prevBilledTotal)}
            </td>
            {/* This (Δ) */}
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600 }}>
              {isRejectedSupplement ? (
                <span style={{ fontWeight: 700, color: "#b91c1c", fontSize: 11, letterSpacing: "0.08em" }}>
                  REJECTED
                </span>
              ) : (
                formatMoney(li.thisInvTotal)
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const InvoicePetlFlatVirtualizedTable = memo(function InvoicePetlFlatVirtualizedTable({
  lines,
  editingLineId,
  editDraft,
  editSaving,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  formatMoney,
  formatBillingTag,
  getLineBackground,
  getEffectiveTag,
  containerHeight,
}: InvoicePetlFlatVirtualizedTableProps) {
  // Pre-sort lines once (memoized) instead of sorting inline during render
  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      // Sort by displayLineNo for PETL-like ordering (1, 1.001, 1.002, 2, etc.)
      const aDisplay = String(a?.displayLineNo ?? a?.lineNoSnapshot ?? "0");
      const bDisplay = String(b?.displayLineNo ?? b?.lineNoSnapshot ?? "0");
      const aParts = aDisplay.split(".").map((p: string) => Number(p) || 0);
      const bParts = bDisplay.split(".").map((p: string) => Number(p) || 0);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] ?? 0;
        const bVal = bParts[i] ?? 0;
        if (aVal !== bVal) return aVal - bVal;
      }
      const ka = String(a?.kind ?? "");
      const kb = String(b?.kind ?? "");
      return ka.localeCompare(kb);
    });
  }, [lines]);

  const rowProps: VirtualizedRowProps = useMemo(
    () => ({
      sortedLines,
      editingLineId,
      editDraft,
      editSaving,
      onStartEdit,
      onEditDraftChange,
      onSaveEdit,
      onCancelEdit,
      formatMoney,
      formatBillingTag,
      getLineBackground,
      getEffectiveTag,
    }),
    [
      sortedLines,
      editingLineId,
      editDraft,
      editSaving,
      onStartEdit,
      onEditDraftChange,
      onSaveEdit,
      onCancelEdit,
      formatMoney,
      formatBillingTag,
      getLineBackground,
      getEffectiveTag,
    ]
  );

  const getRowHeight = useCallback(() => ROW_HEIGHT, []);

  return (
    <div
      className="print-expand-scroll"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "auto" }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Estimate Line Item</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Room</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Unit</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Building</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>%</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Earned</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Prev billed</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>This (Δ)</th>
            </tr>
          </thead>
        </table>
      </div>
      {/* Virtualized rows */}
      <List
        style={{ height: Math.max(200, containerHeight - 40), width: "100%" }}
        defaultHeight={400}
        rowCount={sortedLines.length}
        rowHeight={getRowHeight}
        rowComponent={VirtualizedFlatRow}
        rowProps={rowProps}
        overscanCount={10}
      />
    </div>
  );
});

export default InvoicePetlFlatVirtualizedTable;
