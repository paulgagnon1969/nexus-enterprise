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
  categoryCodeSnapshot?: string | null;
  selectionCodeSnapshot?: string | null;
  descriptionSnapshot?: string | null;
  percentCompleteSnapshot?: number | null;
  earnedTotal?: number | null;
  prevBilledTotal?: number | null;
  thisInvTotal?: number | null;
  contractTotal?: number | null;
  billingTag?: string | null;
  parentLineId?: string | null;
}

interface InvoicePetlGroup {
  groupKey: string;
  groupLabel: string;
  lines: InvoicePetlLine[];
  subtotal: number;
}

interface FlatRow {
  type: "group" | "line";
  groupKey: string;
  groupLabel: string;
  groupSubtotal: number;
  isGroupOpen: boolean;
  line?: InvoicePetlLine;
}

interface InvoicePetlVirtualizedTableProps {
  groups: InvoicePetlGroup[];
  openGroupKeys: Set<string>;
  onToggleGroup: (groupKey: string) => void;
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

const ROW_HEIGHT = 36;
const GROUP_ROW_HEIGHT = 40;

interface VirtualizedRowProps {
  flatRows: FlatRow[];
  onToggleGroup: (groupKey: string) => void;
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

function VirtualizedRow({
  index,
  style,
  flatRows,
  onToggleGroup,
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
  const row = flatRows[index];
  if (!row) return null;

  if (row.type === "group") {
    return (
      <div style={{ ...style, display: "flex", alignItems: "stretch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <tbody>
            <tr
              style={{ background: "#eef2ff", cursor: "pointer" }}
              onClick={() => onToggleGroup(row.groupKey)}
            >
              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontWeight: 700 }}>
                {row.isGroupOpen ? "▾ " : "▸ "}
                {row.groupLabel}
              </td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 70 }}>—</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 90 }}>—</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 110 }}>—</td>
              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700, width: 110 }}>
                {formatMoney(row.groupSubtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // Line row
  const li = row.line!;
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
        <tbody>
          <tr style={{ background: rowBg }}>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span
                  style={{
                    paddingLeft: isCredit ? 44 : 36,
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
                    <>
                      <select
                        value={editDraft}
                        onChange={(e) => onEditDraftChange(e.target.value)}
                        disabled={editSaving}
                        style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="NONE">(none)</option>
                        <option value="PETL_LINE_ITEM">PETL Line Item</option>
                        <option value="SUPPLEMENT">Supplement</option>
                        <option value="CHANGE_ORDER">Change Order</option>
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
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: "1px solid #22c55e",
                          background: "#dcfce7",
                          color: "#166534",
                          cursor: "pointer",
                        }}
                      >
                        {editSaving ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelEdit();
                        }}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          background: "#f9fafb",
                          color: "#374151",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </td>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 70 }}>
              {li.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—"}
            </td>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 90 }}>
              {formatMoney(li.earnedTotal)}
            </td>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563", width: 110 }}>
              {formatMoney(li.prevBilledTotal)}
            </td>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600, width: 110 }}>
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

export const InvoicePetlVirtualizedTable = memo(function InvoicePetlVirtualizedTable({
  groups,
  openGroupKeys,
  onToggleGroup,
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
}: InvoicePetlVirtualizedTableProps) {
  // Build flat row list for virtualization
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const g of groups) {
      const isOpen = openGroupKeys.has(g.groupKey);
      rows.push({
        type: "group",
        groupKey: g.groupKey,
        groupLabel: g.groupLabel,
        groupSubtotal: g.subtotal,
        isGroupOpen: isOpen,
      });

      if (isOpen) {
        for (const line of g.lines) {
          rows.push({
            type: "line",
            groupKey: g.groupKey,
            groupLabel: g.groupLabel,
            groupSubtotal: g.subtotal,
            isGroupOpen: isOpen,
            line,
          });
        }
      }
    }
    return rows;
  }, [groups, openGroupKeys]);

  const getRowHeight = useCallback(
    (index: number, rowProps: VirtualizedRowProps) => {
      const row = rowProps.flatRows[index];
      return row?.type === "group" ? GROUP_ROW_HEIGHT : ROW_HEIGHT;
    },
    []
  );

  const rowProps: VirtualizedRowProps = useMemo(
    () => ({
      flatRows,
      onToggleGroup,
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
      flatRows,
      onToggleGroup,
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

  return (
    <div style={{ borderRadius: 8, border: "1px solid #e5e7eb", backgroundColor: "#ffffff", overflow: "hidden" }}>
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Estimate Line Item</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 70 }}>%</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 90 }}>Earned</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 110 }}>Prev billed</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 110 }}>This (Δ)</th>
            </tr>
          </thead>
        </table>
      </div>
      {/* Virtualized list */}
      <List
        style={{ height: Math.max(200, containerHeight - 40), width: "100%" }}
        defaultHeight={400}
        rowCount={flatRows.length}
        rowHeight={getRowHeight}
        rowComponent={VirtualizedRow}
        rowProps={rowProps}
        overscanCount={5}
      />
    </div>
  );
});

export default InvoicePetlVirtualizedTable;
