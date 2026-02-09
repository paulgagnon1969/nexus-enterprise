"use client";

import { memo, useMemo, useRef } from "react";
import { AutoSizer, List } from "react-virtualized";
import "react-virtualized/styles.css";

// Local copies of the core Financial types used by these helpers. Kept in sync
// with the definitions in page.tsx.
type GoldenPriceListRow = {
  lineNo: number | null;
  cat: string | null;
  sel: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  lastKnownUnitPrice: number | null;
  coverage: string | null;
  activity: string | null;
  divisionCode: string | null;
  divisionName: string | null;
};

type GoldenPriceUpdateLogEntry = {
  id: string;
  createdAt: string;
  projectId: string | null;
  projectName: string;
  estimateVersionId: string | null;
  estimateLabel: string | null;
  updatedCount: number;
  avgDelta: number;
  avgPercentDelta: number;
  userId: string | null;
  userName: string | null;
  source: "XACT_ESTIMATE" | "GOLDEN_PETL";
};

type GoldenComponent = {
  id: string;
  priceListItemId: string;
  componentCode: string;
  description: string | null;
  quantity: number | null;
  material: number | null;
  labor: number | null;
  equipment: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type GoldenItemWithComponents = {
  id: string;
  cat: string | null;
  sel: string | null;
  activity: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  lastKnownUnitPrice: number | null;
  divisionCode: string | null;
  divisionName: string | null;
  components: GoldenComponent[];
};

export type GoldenComponentsCoverageProps = {
  loadingComponents: boolean;
  componentsSummary: {
    itemsWithComponents: number;
    totalComponents: number;
  } | null;
  currentItemCount: number | null;
  lastComponentsUpload: {
    at: string | null;
    byName: string | null;
    byEmail: string | null;
  } | null;
  onViewDetails: () => void;
};

export const GoldenComponentsCoverageCard = memo(function GoldenComponentsCoverageCard({
  loadingComponents,
  componentsSummary,
  currentItemCount,
  lastComponentsUpload,
  onViewDetails,
}: GoldenComponentsCoverageProps) {
  const { itemsWithComponents, totalComponents } = useMemo(() => {
    if (!componentsSummary) {
      return { itemsWithComponents: 0, totalComponents: 0 };
    }
    return componentsSummary;
  }, [componentsSummary]);

  let lastUploadLabel: string | null = null;
  const lastUploadByName = lastComponentsUpload?.byName ?? null;
  const lastUploadByEmail = lastComponentsUpload?.byEmail ?? null;
  if (lastComponentsUpload?.at) {
    lastUploadLabel = new Date(lastComponentsUpload.at).toLocaleString();
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px dashed #d1d5db",
        background: "#f9fafb",
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          Golden Components coverage (per current PETL)
        </div>
        <button
          type="button"
          onClick={onViewDetails}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          View details
        </button>
      </div>
      {loadingComponents ? (
        <div style={{ fontSize: 11, color: "#6b7280" }}>Loading components…</div>
      ) : !componentsSummary || itemsWithComponents === 0 ? (
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          No Golden components have been imported yet for the current Golden PETL.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#374151" }}>
          <p style={{ margin: 0 }}>
            Items with components: <strong>{itemsWithComponents}</strong>
            {currentItemCount != null && (
              <>
                {" "}of <strong>{currentItemCount}</strong> Golden PETL line items
              </>
            )}
          </p>
          <p style={{ margin: "4px 0 0" }}>
            Total Golden Components: <strong>{totalComponents.toLocaleString()}</strong>
            {totalComponents === 0 && (
              <span style={{ color: "#6b7280" }}>
                {" "}- Components = 0 when there is no inventory in stock
              </span>
            )}
          </p>
          {lastUploadLabel && (
            <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
              Last components upload: {lastUploadLabel}
              {(lastUploadByName || lastUploadByEmail) && (
                <>
                  {" "}by{" "}
                  {lastUploadByName && <strong>{lastUploadByName}</strong>}
                  {lastUploadByEmail && (
                    <>
                      {lastUploadByName && " ("}
                      <a
                        href={`mailto:${lastUploadByEmail}`}
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {lastUploadByEmail}
                      </a>
                      {lastUploadByName && ")"}
                    </>
                  )}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export type GoldenPriceListTableProps = {
  goldenRows: GoldenPriceListRow[];
  loadingGoldenTable: boolean;
  goldenTableError: string | null;
};

export const GoldenPriceListTable = memo(function GoldenPriceListTable({
  goldenRows,
  loadingGoldenTable,
  goldenTableError,
}: GoldenPriceListTableProps) {
  const listRef = useRef<any>(null);
  
  const handleJumpToEnd = () => {
    if (listRef.current && goldenRows.length > 0) {
      listRef.current.scrollToRow(goldenRows.length - 1);
    }
  };
  
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        height: "75vh",
      }}
    >
      <div
        style={{
          padding: 8,
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Golden Price List – Raw Table</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Showing Cat/Sel rows with mapped construction divisions. This is a read-only
            view of the master Xactimate file.
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", display: "flex", gap: 8, alignItems: "center" }}>
          {loadingGoldenTable
            ? "Loading rows…"
            : goldenRows.length
            ? `${goldenRows.length.toLocaleString()} items`
            : "No rows loaded"}
          {goldenRows.length > 0 && (
            <button
              onClick={handleJumpToEnd}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                cursor: "pointer",
              }}
            >
              Jump to end
            </button>
          )}
        </div>
      </div>

      {goldenTableError && (
        <div
          style={{
            padding: 8,
            fontSize: goldenTableError.includes("Cannot read properties of null (reading 'rows')")
              ? 12
              : 11,
            color: goldenTableError.includes("Cannot read properties of null (reading 'rows')")
              ? "#1d4ed8"
              : "#b91c1c",
          }}
        >
          {goldenTableError.includes("Cannot read properties of null (reading 'rows')")
            ? "When you upload a new Golden Price List it will show here."
            : goldenTableError}
        </div>
      )}

      {!goldenTableError && (
        <div
          style={{
            flex: 1,
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Fixed header */}
          <div style={{ background: "#f9fafb", fontSize: 11, display: "flex", borderBottom: "1px solid #e5e7eb", padding: "4px 0", flexShrink: 0 }}>
            <div style={{ width: 60, padding: "0 6px", fontWeight: 600 }}>Line</div>
            <div style={{ width: 70, padding: "0 6px", fontWeight: 600 }}>Cat</div>
            <div style={{ width: 70, padding: "0 6px", fontWeight: 600 }}>Sel</div>
            <div style={{ flex: 1, padding: "0 6px", fontWeight: 600 }}>Description</div>
            <div style={{ width: 60, padding: "0 6px", fontWeight: 600 }}>Unit</div>
            <div style={{ width: 90, padding: "0 6px", fontWeight: 600, textAlign: "right" }}>Last known</div>
            <div style={{ width: 90, padding: "0 6px", fontWeight: 600, textAlign: "right" }}>Unit price</div>
            <div style={{ width: 80, padding: "0 6px", fontWeight: 600 }}>Division</div>
            <div style={{ width: 180, padding: "0 6px", fontWeight: 600 }}>Div name</div>
          </div>

          {/* Virtualized rows */}
          <div style={{ flex: 1, width: "100%", position: "relative" }}>
            <AutoSizer>
              {({ height, width }) => (
                <List
                  ref={listRef}
                  width={width}
                  height={height}
                  rowCount={goldenRows.length}
                  rowHeight={24}
                  style={{ outline: "none" }}
              rowRenderer={({ index, key, style }) => {
                const row = goldenRows[index];
                return (
                  <div
                    key={key}
                    style={{
                      ...style,
                      display: "flex",
                      fontSize: 11,
                      borderTop: "1px solid #f3f4f6",
                    }}
                  >
                    <div style={{ width: 60, padding: "0 6px", whiteSpace: "nowrap", color: "#6b7280", overflow: "hidden" }}>
                      {row.lineNo ?? ""}
                    </div>
                    <div style={{ width: 70, padding: "0 6px", fontWeight: 600, overflow: "hidden" }}>
                      {row.cat ?? ""}
                    </div>
                    <div style={{ width: 70, padding: "0 6px", overflow: "hidden" }}>
                      {row.sel ?? ""}
                    </div>
                    <div style={{ flex: 1, padding: "0 6px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.description ?? ""}
                    </div>
                    <div style={{ width: 60, padding: "0 6px", overflow: "hidden" }}>
                      {row.unit ?? ""}
                    </div>
                    <div style={{ width: 90, padding: "0 6px", textAlign: "right", color: "#6b7280", overflow: "hidden" }}>
                      {row.lastKnownUnitPrice != null
                        ? `$${row.lastKnownUnitPrice.toFixed(2)}`
                        : ""}
                    </div>
                    <div style={{ width: 90, padding: "0 6px", textAlign: "right", overflow: "hidden" }}>
                      {row.unitPrice != null
                        ? `$${row.unitPrice.toFixed(2)}`
                        : ""}
                    </div>
                    <div style={{ width: 80, padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {row.divisionCode ?? ""}
                    </div>
                    <div style={{ width: 180, padding: "0 6px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.divisionName ?? ""}
                    </div>
                  </div>
                );
              }}
            />
              )}
            </AutoSizer>
          </div>
        </div>
      )}
    </div>
  );
});

export type GoldenPriceListHistoryProps = {
  goldenHistory: GoldenPriceUpdateLogEntry[];
  goldenHistoryError: string | null;
  loadingGoldenHistory: boolean;
};

export const GoldenPriceListHistory = memo(function GoldenPriceListHistory({
  goldenHistory,
  goldenHistoryError,
  loadingGoldenHistory,
}: GoldenPriceListHistoryProps) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        fontSize: 12,
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: 8,
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Golden Price List – Revision Log</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            History of Golden repricing events from Xact RAW estimate imports.
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          {loadingGoldenHistory
            ? "Loading…"
            : goldenHistory.length
            ? `${goldenHistory.length} updates`
            : "No updates yet"}
        </div>
      </div>

      {goldenHistoryError && (
        <div style={{ padding: 8, fontSize: 11, color: "#b91c1c" }}>{goldenHistoryError}</div>
      )}

      {!goldenHistoryError && (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 11,
            }}
          >
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>When</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 80 }}>Source</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Project</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Estimate</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 70 }}>Items</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>Avg Δ</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>Avg Δ %</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>By</th>
              </tr>
            </thead>
            <tbody>
              {goldenHistory.map((entry) => {
                const when = new Date(entry.createdAt);
                const whenLabel = when.toLocaleString();
                const avgDeltaLabel = `$${entry.avgDelta.toFixed(2)}`;
                const avgPctLabel = `${(entry.avgPercentDelta * 100).toFixed(1)}%`;
                const sourceLabel = entry.source === "GOLDEN_PETL" ? "GPL" : "CSV";
                return (
                  <tr key={entry.id}>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                        color: "#6b7280",
                      }}
                    >
                      {whenLabel}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        whiteSpace: "nowrap",
                        color: entry.source === "GOLDEN_PETL" ? "#1d4ed8" : "#15803d",
                      }}
                    >
                      {sourceLabel}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                      }}
                    >
                      {entry.projectName}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        color: "#6b7280",
                      }}
                    >
                      {entry.estimateLabel ?? entry.estimateVersionId}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        textAlign: "right",
                      }}
                    >
                      {entry.updatedCount.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        textAlign: "right",
                      }}
                    >
                      {avgDeltaLabel}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        textAlign: "right",
                      }}
                    >
                      {avgPctLabel}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderTop: "1px solid #f3f4f6",
                        color: "#6b7280",
                      }}
                    >
                      {entry.userName ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export type GoldenComponentsTableProps = {
  componentsItems: GoldenItemWithComponents[];
};

export const GoldenComponentsTable = memo(function GoldenComponentsTable({
  componentsItems,
}: GoldenComponentsTableProps) {
  return (
    <div
      style={{
        maxHeight: "70vh",
        minHeight: "40vh",
        overflow: "auto",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        background: "#ffffff",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
        }}
      >
        <thead style={{ background: "#f9fafb" }}>
          <tr>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>Cat</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>Sel</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>ACT</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 80 }}>Division</th>
            <th style={{ padding: "4px 6px", textAlign: "left" }}>Line description</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 120 }}>Component</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 70 }}>Qty</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Material</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Labor</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Equip</th>
          </tr>
        </thead>
        <tbody>
          {componentsItems.flatMap((item) =>
            item.components.map((comp: GoldenComponent) => (
              <tr key={`${item.id}-${comp.id}`}>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                    fontWeight: 600,
                  }}
                >
                  {item.cat ?? ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {item.sel ?? ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {item.activity ?? ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {item.divisionCode ?? ""} {item.divisionName ? `– ${item.divisionName}` : ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {item.description ?? ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {comp.componentCode}
                  {comp.description ? ` – ${comp.description}` : ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                    textAlign: "right",
                  }}
                >
                  {comp.quantity ?? ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                    textAlign: "right",
                  }}
                >
                  {comp.material != null
                    ? comp.material.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                    textAlign: "right",
                  }}
                >
                  {comp.labor != null
                    ? comp.labor.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    borderTop: "1px solid #f3f4f6",
                    textAlign: "right",
                  }}
                >
                  {comp.equipment != null
                    ? comp.equipment.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : ""}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
});
