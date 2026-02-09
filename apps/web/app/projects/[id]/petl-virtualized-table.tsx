"use client";

import * as React from "react";
import { memo, useCallback, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";

interface PetlItem {
  id: string;
  lineNo: number;
  sourceLineNo?: number | null;
  description: string | null;
  itemNote?: string | null;
  qty: number | null;
  unit: string | null;
  itemAmount: number | null;
  rcvAmount: number | null;
  percentComplete: number;
  isAcvOnly?: boolean;
  payerType: string;
  categoryCode: string | null;
  selectionCode: string | null;
  activity: string | null;
  projectParticle?: {
    id: string;
    name: string;
    fullLabel: string;
  } | null;
  // Standalone Change Order fields
  isStandaloneChangeOrder?: boolean;
  coSequenceNo?: number | null;
  coSourceLineNo?: number | null;
}

interface ReconEntry {
  id: string;
  kind: string;
  description?: string | null;
  note?: string | null;
  qty?: number | null;
  unit?: string | null;
  itemAmount?: number | null;
  rcvAmount?: number | null;
  percentComplete?: number;
  isPercentCompleteLocked?: boolean;
}

interface PetlRowProps {
  item: PetlItem;
  reconEntries: ReconEntry[];
  isExpanded: boolean;
  isFlagged: boolean;
  hasRecon: boolean;
  isPmOrAbove: boolean;
  isAdminOrAbove: boolean;
  editingCell: { sowItemId: string; field: string } | null;
  editDraft: string;
  editSaving: boolean;
  onToggleExpand: (itemId: string) => void;
  onToggleFlag: (itemId: string) => void;
  onOpenReconciliation: (itemId: string) => void;
  onDeleteItem: (item: PetlItem) => void;
  onOpenCellEditor: (sowItemId: string, field: "qty" | "unit" | "rcvAmount" | "categoryCode" | "selectionCode", current: any) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditReconEntry?: (entry: any) => void;
}

// Memoized row component to prevent unnecessary re-renders
const PetlRow = memo(function PetlRow({
  item,
  reconEntries,
  isExpanded,
  isFlagged,
  hasRecon,
  isPmOrAbove,
  isAdminOrAbove,
  editingCell,
  editDraft,
  editSaving,
  onToggleExpand,
  onToggleFlag,
  onOpenReconciliation,
  onDeleteItem,
  onOpenCellEditor,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onEditReconEntry,
}: PetlRowProps) {
  const reconFinancial = reconEntries.filter((e) => e?.rcvAmount != null);
  const showSublines = isExpanded && reconFinancial.length > 0;

  const bg = isFlagged
    ? "#fef3c7"
    : hasRecon
      ? "#e0f2fe"
      : "transparent";

  // Display CO line number format (e.g., "15-CO1") for standalone change orders
  const displayLineNo = item.isStandaloneChangeOrder && item.coSequenceNo != null && item.coSourceLineNo != null
    ? `${item.coSourceLineNo}-CO${item.coSequenceNo}`
    : item.sourceLineNo && item.sourceLineNo > 0 ? item.sourceLineNo : item.lineNo;

  const reconSeqById = new Map<string, number>();
  reconFinancial.forEach((e, idx) => {
    if (e?.id) reconSeqById.set(String(e.id), idx + 1);
  });

  const isEditingQty = editingCell?.sowItemId === item.id && editingCell.field === "qty";
  const isEditingUnit = editingCell?.sowItemId === item.id && editingCell.field === "unit";
  const isEditingRcv = editingCell?.sowItemId === item.id && editingCell.field === "rcvAmount";
  const isEditingCat = editingCell?.sowItemId === item.id && editingCell.field === "categoryCode";
  const isEditingSel = editingCell?.sowItemId === item.id && editingCell.field === "selectionCode";

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSaveEdit();
    } else if (e.key === "Escape") {
      onCancelEdit();
    }
  }, [onSaveEdit, onCancelEdit]);

  return (
    <>
      <tr style={{ backgroundColor: bg }}>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {reconFinancial.length > 0 ? (
              <button
                type="button"
                onClick={() => onToggleExpand(item.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                  color: "#2563eb",
                  width: 14,
                  textAlign: "center",
                }}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {showSublines ? "▾" : "▸"}
              </button>
            ) : (
              <span style={{ width: 14 }} />
            )}
            <span>{displayLineNo}</span>
          </div>
        </td>
        <td
          title={item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
          style={{
            padding: "4px 8px",
            borderTop: "1px solid #e5e7eb",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 220,
          }}
        >
          {item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
        </td>
        <td
          style={{
            padding: "4px 8px",
            borderTop: "1px solid #e5e7eb",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 100,
          }}
        >
          {item.activity ?? ""}
        </td>
        <td
          style={{
            padding: "4px 8px",
            borderTop: "1px solid #e5e7eb",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 520,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span title={item.description ?? ""}>{item.description ?? ""}</span>
            {item.itemNote && (
              <span
                title={`V0 Note: ${item.itemNote}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: "help",
                  flexShrink: 0,
                  border: "1px solid #fbbf24",
                }}
              >
                NOTE
              </span>
            )}
          </div>
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
          {isPmOrAbove && isEditingQty ? (
            <input
              type="number"
              value={editDraft}
              autoFocus
              onChange={(e) => onEditDraftChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={handleKeyDown}
              disabled={editSaving}
              style={{ width: 80, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
            />
          ) : (
            <button
              type="button"
              disabled={!isPmOrAbove}
              onClick={() => onOpenCellEditor(item.id, "qty", item.qty)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: isPmOrAbove ? "pointer" : "default",
                minWidth: 60,
                textAlign: "right",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {item.qty ?? ""}
            </button>
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
          {isPmOrAbove && isEditingUnit ? (
            <input
              type="text"
              value={editDraft}
              autoFocus
              onChange={(e) => onEditDraftChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={handleKeyDown}
              disabled={editSaving}
              style={{ width: 80, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
            />
          ) : (
            <button
              type="button"
              disabled={!isPmOrAbove}
              onClick={() => onOpenCellEditor(item.id, "unit", item.unit)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: isPmOrAbove ? "pointer" : "default",
                minWidth: 60,
                textAlign: "right",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {item.unit ?? ""}
            </button>
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
          {(item.itemAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
          {isPmOrAbove && isEditingRcv ? (
            <input
              type="number"
              value={editDraft}
              autoFocus
              onChange={(e) => onEditDraftChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={handleKeyDown}
              disabled={editSaving}
              style={{ width: 80, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
            />
          ) : (
            <button
              type="button"
              disabled={!isPmOrAbove}
              onClick={() => onOpenCellEditor(item.id, "rcvAmount", item.rcvAmount)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: isPmOrAbove ? "pointer" : "default",
                minWidth: 60,
                textAlign: "right",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {(item.rcvAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </button>
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
          {item.isAcvOnly ? (
            <span style={{ color: "#9ca3af" }}>ACV</span>
          ) : (
            `${item.percentComplete}%`
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
          {isPmOrAbove && isEditingCat ? (
            <input
              type="text"
              value={editDraft}
              autoFocus
              onChange={(e) => onEditDraftChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={handleKeyDown}
              disabled={editSaving}
              style={{ width: 80, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
            />
          ) : (
            <button
              type="button"
              disabled={!isPmOrAbove}
              onClick={() => onOpenCellEditor(item.id, "categoryCode", item.categoryCode)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: isPmOrAbove ? "pointer" : "default",
                minWidth: 60,
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {item.categoryCode ?? ""}
            </button>
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
          {isPmOrAbove && isEditingSel ? (
            <input
              type="text"
              value={editDraft}
              autoFocus
              onChange={(e) => onEditDraftChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={handleKeyDown}
              disabled={editSaving}
              style={{ width: 80, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
            />
          ) : (
            <button
              type="button"
              disabled={!isPmOrAbove}
              onClick={() => onOpenCellEditor(item.id, "selectionCode", item.selectionCode)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: isPmOrAbove ? "pointer" : "default",
                minWidth: 60,
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {item.selectionCode ?? ""}
            </button>
          )}
        </td>
        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onToggleFlag(item.id)}
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                border: isFlagged ? "1px solid #b45309" : "1px solid #d1d5db",
                background: isFlagged ? "#fffbeb" : "#ffffff",
                fontSize: 11,
                cursor: "pointer",
                color: isFlagged ? "#92400e" : "#374151",
              }}
            >
              {isFlagged ? "Needs review" : "Flag"}
            </button>
            <button
              type="button"
              onClick={() => onOpenReconciliation(item.id)}
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                border: "1px solid #2563eb",
                background: "#eff6ff",
                fontSize: 11,
                cursor: "pointer",
                color: "#1d4ed8",
              }}
            >
              Reconcile
            </button>
            {isAdminOrAbove && (
              <button
                type="button"
                onClick={() => onDeleteItem(item)}
                style={{
                  padding: "2px 6px",
                  borderRadius: 999,
                  border: "1px solid #b91c1c",
                  background: "#fff1f2",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "#b91c1c",
                }}
              >
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {showSublines &&
        reconFinancial.map((e) => {
          const entryId = String(e?.id ?? "");
          if (!entryId) return null;
          const seq = reconSeqById.get(entryId);
          if (!seq) return null;

          const lineLabel = `${displayLineNo}.${seq}`;
          const kind = String(e?.kind ?? "").trim();
          const desc = String(e?.description ?? "").trim();
          const note = String(e?.note ?? "").trim();
          const rcvAmt = typeof e?.rcvAmount === "number" ? e.rcvAmount : null;
          const isCredit = kind === "CREDIT" || (rcvAmt != null && rcvAmt < 0);
          const pct = e?.isPercentCompleteLocked ? 0 : (e?.percentComplete ?? 0);

          return (
            <tr
              key={`${item.id}::recon::${entryId}`}
              onClick={() => onEditReconEntry?.(e)}
              style={{
                backgroundColor: "#f8fafc",
                color: isCredit ? "#b91c1c" : "#111827",
                cursor: "pointer",
              }}
              title="Click to edit this entry"
            >
              <td
                style={{
                  padding: "4px 8px",
                  borderTop: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                <span style={{ paddingLeft: 18 }}>↳ {lineLabel}</span>
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }} />
              <td
                title={`${kind}: ${desc || note}`}
                style={{
                  padding: "4px 8px",
                  borderTop: "1px solid #e5e7eb",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 520,
                }}
              >
                <span style={{ color: "#6b7280" }}>[{kind}]</span> {desc || note || ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                {e?.qty ?? ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                {e?.unit ?? ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                {e?.itemAmount != null ? e.itemAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                {rcvAmt != null ? rcvAmt.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                {pct}%
              </td>
              <td colSpan={3} style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }} />
            </tr>
          );
        })}
    </>
  );
});

// Flatten items into a render list that includes both items and their expanded sub-rows
interface FlatRow {
  type: "item" | "recon";
  item: PetlItem;
  reconEntry?: ReconEntry;
  reconSeq?: number;
  displayLineNo: string | number; // Can be string for CO format like "15-CO1"
}

export interface PetlVirtualizedTableProps {
  items: PetlItem[];
  reconEntriesBySowItemId: Map<string, ReconEntry[]>;
  expandedIds: Set<string>;
  flaggedIds: Set<string>;
  reconActivityIds: Set<string>;
  isPmOrAbove: boolean;
  isAdminOrAbove: boolean;
  editingCell: { sowItemId: string; field: string } | null;
  editDraft: string;
  editSaving: boolean;
  containerHeight: number;
  onToggleExpand: (itemId: string) => void;
  onToggleFlag: (itemId: string) => void;
  onOpenReconciliation: (itemId: string) => void;
  onDeleteItem: (item: PetlItem) => void;
  onOpenCellEditor: (sowItemId: string, field: "qty" | "unit" | "rcvAmount" | "categoryCode" | "selectionCode", current: any) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onPercentChange: (sowItemId: string, displayLineNo: string | number, newPercent: number, isAcvOnly: boolean) => void;
  onEditReconEntry?: (entry: any) => void;
}

const ROW_HEIGHT = 36;
const RECON_ROW_HEIGHT = 32;

// Row props passed to each row component via react-window v2 rowProps
interface VirtualizedRowProps {
  flatRows: FlatRow[];
  reconEntriesBySowItemId: Map<string, ReconEntry[]>;
  expandedIds: Set<string>;
  flaggedIds: Set<string>;
  reconActivityIds: Set<string>;
  isPmOrAbove: boolean;
  isAdminOrAbove: boolean;
  editingCell: { sowItemId: string; field: string } | null;
  editDraft: string;
  editSaving: boolean;
  onToggleExpand: (itemId: string) => void;
  onToggleFlag: (itemId: string) => void;
  onOpenReconciliation: (itemId: string) => void;
  onDeleteItem: (item: PetlItem) => void;
  onOpenCellEditor: (sowItemId: string, field: "qty" | "unit" | "rcvAmount" | "categoryCode" | "selectionCode", current: any) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onPercentChange: (sowItemId: string, displayLineNo: string | number, newPercent: number, isAcvOnly: boolean) => void;
  onEditReconEntry?: (entry: any) => void;
}

// react-window v2 row component
function VirtualizedRow({
  index,
  style,
  flatRows,
  reconEntriesBySowItemId,
  expandedIds,
  flaggedIds,
  reconActivityIds,
  isPmOrAbove,
  isAdminOrAbove,
  editingCell,
  editDraft,
  editSaving,
  onToggleExpand,
  onToggleFlag,
  onOpenReconciliation,
  onDeleteItem,
  onOpenCellEditor,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onPercentChange,
}: RowComponentProps<VirtualizedRowProps>): React.ReactElement | null {
  const row = flatRows[index];
  if (!row) return null;

  if (row.type === "recon") {
    const e = row.reconEntry!;
    const kind = String(e?.kind ?? "").trim();
    const desc = String(e?.description ?? "").trim();
    const note = String(e?.note ?? "").trim();
    const rcvAmt = typeof e?.rcvAmount === "number" ? e.rcvAmount : null;
    const isCredit = kind === "CREDIT" || (rcvAmt != null && rcvAmt < 0);
    const lineLabel = `${row.displayLineNo}.${row.reconSeq}`;

    return (
      <div style={{ ...style, display: "flex", alignItems: "stretch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <tbody>
            <tr style={{ backgroundColor: "#f8fafc", color: isCredit ? "#b91c1c" : "#111827" }}>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 120, fontFamily: "monospace" }}>
                <span style={{ paddingLeft: 18 }}>↳ {lineLabel}</span>
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 220 }} />
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100 }} />
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ color: "#6b7280" }}>[{kind}]</span> {desc || note || ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80, textAlign: "right" }}>{e?.qty ?? ""}</td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80, textAlign: "right" }}>{e?.unit ?? ""}</td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100, textAlign: "right" }}>
                {e?.itemAmount != null ? e.itemAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100, textAlign: "right" }}>
                {rcvAmt != null ? rcvAmt.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 60, textAlign: "right" }}>
                {e?.isPercentCompleteLocked ? 0 : (e?.percentComplete ?? 0)}%
              </td>
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80 }} />
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80 }} />
              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 180 }} />
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const { item } = row;
  const reconEntries = reconEntriesBySowItemId.get(item.id) ?? [];
  const isFlagged = flaggedIds.has(item.id);
  const hasRecon = reconActivityIds.has(item.id);
  const isExpanded = expandedIds.has(item.id);
  const reconFinancial = reconEntries.filter((e) => e?.rcvAmount != null);

  const bg = isFlagged ? "#fef3c7" : hasRecon ? "#e0f2fe" : "transparent";
  const displayLineNo = row.displayLineNo;

  const isEditingQty = editingCell?.sowItemId === item.id && editingCell.field === "qty";
  const isEditingUnit = editingCell?.sowItemId === item.id && editingCell.field === "unit";
  const isEditingRcv = editingCell?.sowItemId === item.id && editingCell.field === "rcvAmount";
  const isEditingCat = editingCell?.sowItemId === item.id && editingCell.field === "categoryCode";
  const isEditingSel = editingCell?.sowItemId === item.id && editingCell.field === "selectionCode";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSaveEdit();
    else if (e.key === "Escape") onCancelEdit();
  };

  return (
    <div style={{ ...style, display: "flex", alignItems: "stretch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <tbody>
          <tr style={{ backgroundColor: bg }}>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 120, whiteSpace: "nowrap" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {reconFinancial.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onToggleExpand(item.id)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: 12, color: "#2563eb", width: 14, textAlign: "center" }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span style={{ width: 14 }} />
                )}
                <span>{displayLineNo}</span>
              </div>
            </td>
            <td title={item.projectParticle?.fullLabel ?? ""} style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.activity ?? ""}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span title={item.description ?? ""}>{item.description ?? ""}</span>
                {item.itemNote && (
                  <span
                    title={`V0 Note: ${item.itemNote}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#fef3c7",
                      color: "#92400e",
                      fontSize: 9,
                      fontWeight: 600,
                      cursor: "help",
                      flexShrink: 0,
                      border: "1px solid #fbbf24",
                    }}
                  >
                    NOTE
                  </span>
                )}
              </div>
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80, textAlign: "right" }}>
              {isPmOrAbove && isEditingQty ? (
                <input type="number" value={editDraft} autoFocus onChange={(e) => onEditDraftChange(e.target.value)} onBlur={onSaveEdit} onKeyDown={handleKeyDown} disabled={editSaving} style={{ width: 60, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }} />
              ) : (
                <button type="button" disabled={!isPmOrAbove} onClick={() => onOpenCellEditor(item.id, "qty", item.qty)} style={{ border: "none", background: "transparent", padding: 0, cursor: isPmOrAbove ? "pointer" : "default", textAlign: "right", fontSize: 12 }}>
                  {item.qty ?? ""}
                </button>
              )}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80, textAlign: "right" }}>
              {isPmOrAbove && isEditingUnit ? (
                <input type="text" value={editDraft} autoFocus onChange={(e) => onEditDraftChange(e.target.value)} onBlur={onSaveEdit} onKeyDown={handleKeyDown} disabled={editSaving} style={{ width: 60, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }} />
              ) : (
                <button type="button" disabled={!isPmOrAbove} onClick={() => onOpenCellEditor(item.id, "unit", item.unit)} style={{ border: "none", background: "transparent", padding: 0, cursor: isPmOrAbove ? "pointer" : "default", textAlign: "right", fontSize: 12 }}>
                  {item.unit ?? ""}
                </button>
              )}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100, textAlign: "right" }}>
              {(item.itemAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 100, textAlign: "right" }}>
              {isPmOrAbove && isEditingRcv ? (
                <input type="number" value={editDraft} autoFocus onChange={(e) => onEditDraftChange(e.target.value)} onBlur={onSaveEdit} onKeyDown={handleKeyDown} disabled={editSaving} style={{ width: 70, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }} />
              ) : (
                <button type="button" disabled={!isPmOrAbove} onClick={() => onOpenCellEditor(item.id, "rcvAmount", item.rcvAmount)} style={{ border: "none", background: "transparent", padding: 0, cursor: isPmOrAbove ? "pointer" : "default", textAlign: "right", fontSize: 12 }}>
                  {(item.rcvAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </button>
              )}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80, textAlign: "right" }}>
              <select
                value={item.isAcvOnly ? "ACV" : String(item.percentComplete)}
                onChange={(e) => {
                  const val = e.target.value;
                  const isAcv = val === "ACV";
                  const pct = isAcv ? 0 : Number(val);
                  if (!isAcv && (Number.isNaN(pct) || pct < 0 || pct > 100)) return;
                  onPercentChange(item.id, displayLineNo, pct, isAcv);
                }}
                style={{ width: 70, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
              >
                <option value="0">0%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
                <option value="40">40%</option>
                <option value="50">50%</option>
                <option value="60">60%</option>
                <option value="70">70%</option>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="ACV">ACV only</option>
              </select>
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80 }}>
              {isPmOrAbove && isEditingCat ? (
                <input type="text" value={editDraft} autoFocus onChange={(e) => onEditDraftChange(e.target.value)} onBlur={onSaveEdit} onKeyDown={handleKeyDown} disabled={editSaving} style={{ width: 60, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }} />
              ) : (
                <button type="button" disabled={!isPmOrAbove} onClick={() => onOpenCellEditor(item.id, "categoryCode", item.categoryCode)} style={{ border: "none", background: "transparent", padding: 0, cursor: isPmOrAbove ? "pointer" : "default", textAlign: "left", fontSize: 12 }}>
                  {item.categoryCode ?? ""}
                </button>
              )}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 80 }}>
              {isPmOrAbove && isEditingSel ? (
                <input type="text" value={editDraft} autoFocus onChange={(e) => onEditDraftChange(e.target.value)} onBlur={onSaveEdit} onKeyDown={handleKeyDown} disabled={editSaving} style={{ width: 60, padding: "2px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }} />
              ) : (
                <button type="button" disabled={!isPmOrAbove} onClick={() => onOpenCellEditor(item.id, "selectionCode", item.selectionCode)} style={{ border: "none", background: "transparent", padding: 0, cursor: isPmOrAbove ? "pointer" : "default", textAlign: "left", fontSize: 12 }}>
                  {item.selectionCode ?? ""}
                </button>
              )}
            </td>
            <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", width: 180 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button type="button" onClick={() => onToggleFlag(item.id)} style={{ padding: "2px 6px", borderRadius: 999, border: isFlagged ? "1px solid #b45309" : "1px solid #d1d5db", background: isFlagged ? "#fffbeb" : "#ffffff", fontSize: 11, cursor: "pointer", color: isFlagged ? "#92400e" : "#374151" }}>
                  {isFlagged ? "Flagged" : "Flag"}
                </button>
                <button type="button" onClick={() => onOpenReconciliation(item.id)} style={{ padding: "2px 6px", borderRadius: 999, border: "1px solid #2563eb", background: "#eff6ff", fontSize: 11, cursor: "pointer", color: "#1d4ed8" }}>
                  Reconcile
                </button>
                {isAdminOrAbove && (
                  <button type="button" onClick={() => onDeleteItem(item)} style={{ padding: "2px 6px", borderRadius: 999, border: "1px solid #b91c1c", background: "#fff1f2", fontSize: 11, cursor: "pointer", color: "#b91c1c" }}>
                    Delete
                  </button>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const PetlVirtualizedTable = memo(function PetlVirtualizedTable({
  items,
  reconEntriesBySowItemId,
  expandedIds,
  flaggedIds,
  reconActivityIds,
  isPmOrAbove,
  isAdminOrAbove,
  editingCell,
  editDraft,
  editSaving,
  containerHeight,
  onToggleExpand,
  onToggleFlag,
  onOpenReconciliation,
  onDeleteItem,
  onOpenCellEditor,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onPercentChange,
}: PetlVirtualizedTableProps) {

  // Build flat row list for virtualization
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const item of items) {
      // Display CO line number format (e.g., "15-CO1") for standalone change orders
      const displayLineNo = item.isStandaloneChangeOrder && item.coSequenceNo != null && item.coSourceLineNo != null
        ? `${item.coSourceLineNo}-CO${item.coSequenceNo}`
        : item.sourceLineNo && item.sourceLineNo > 0 ? item.sourceLineNo : item.lineNo;
      rows.push({ type: "item", item, displayLineNo });

      if (expandedIds.has(item.id)) {
        const reconEntries = reconEntriesBySowItemId.get(item.id) ?? [];
        const financial = reconEntries.filter((e) => e?.rcvAmount != null);
        financial.forEach((entry, idx) => {
          rows.push({
            type: "recon",
            item,
            reconEntry: entry,
            reconSeq: idx + 1,
            displayLineNo,
          });
        });
      }
    }
    return rows;
  }, [items, expandedIds, reconEntriesBySowItemId]);

  // Row height function for react-window v2
  const getRowHeight = useCallback(
    (index: number, rowProps: VirtualizedRowProps) => {
      const row = rowProps.flatRows[index];
      return row?.type === "recon" ? RECON_ROW_HEIGHT : ROW_HEIGHT;
    },
    []
  );

  // Memoize row props to prevent unnecessary re-renders
  const rowProps: VirtualizedRowProps = useMemo(
    () => ({
      flatRows,
      reconEntriesBySowItemId,
      expandedIds,
      flaggedIds,
      reconActivityIds,
      isPmOrAbove,
      isAdminOrAbove,
      editingCell,
      editDraft,
      editSaving,
      onToggleExpand,
      onToggleFlag,
      onOpenReconciliation,
      onDeleteItem,
      onOpenCellEditor,
      onEditDraftChange,
      onSaveEdit,
      onCancelEdit,
      onPercentChange,
    }),
    [flatRows, reconEntriesBySowItemId, expandedIds, flaggedIds, reconActivityIds, isPmOrAbove, isAdminOrAbove, editingCell, editDraft, editSaving, onToggleExpand, onToggleFlag, onOpenReconciliation, onDeleteItem, onOpenCellEditor, onEditDraftChange, onSaveEdit, onCancelEdit, onPercentChange]
  );

  return (
    <div style={{ borderRadius: 8, border: "1px solid #e5e7eb", backgroundColor: "#ffffff", overflow: "hidden" }}>
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 120 }}>Line</th>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 220 }}>Room</th>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 100 }}>Activity</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Task</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 80 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 80 }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 100 }}>Total</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 100 }}>RCV</th>
              <th style={{ textAlign: "right", padding: "6px 8px", width: 80 }}>%</th>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 80 }}>Cat</th>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 80 }}>Sel</th>
              <th style={{ textAlign: "left", padding: "6px 8px", width: 180 }}>Recon</th>
            </tr>
          </thead>
        </table>
      </div>
      {/* Virtualized list - react-window v2 API */}
      <List
        style={{ height: Math.max(200, containerHeight - 40), width: "100%" }}
        defaultHeight={400}
        rowCount={flatRows.length}
        rowHeight={getRowHeight}
        rowComponent={VirtualizedRow}
        rowProps={rowProps}
        overscanCount={10}
      />
    </div>
  );
});

export default PetlVirtualizedTable;
