"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

function normalizeCatCode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Prefer the first token (some UI strings include "03 - Demo" / "03-Demo" etc.).
  return s.split(/[\s-]+/)[0]?.split(":")[0]?.trim() ?? "";
}

function normalizeSelCode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Selection codes are usually token-like; keep the first whitespace token.
  return s.split(/\s+/)[0]?.split(":")[0]?.trim() ?? "";
}

export const CostBookResultsTable = React.memo(function CostBookResultsTable(props: {
  items: any[];
  qty: number;
  baselineCat: string;
  baselineSel: string;
  rowHeightPx?: number;
  overscan?: number;
  onSelect: (companyPriceListItemId: string) => void;
  // Change this value to request an auto-scroll to the baseline match.
  autoScrollRequestId?: string;
}) {
  const {
    items,
    qty,
    baselineCat,
    baselineSel,
    rowHeightPx = 44,
    overscan = 10,
    onSelect,
    autoScrollRequestId,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Keep scroll state local to this component so the giant project page does not
  // re-render on every scroll event.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;

    const updateSizes = () => {
      setViewportHeight(el.clientHeight || 600);
    };

    const onScrollInternal = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setScrollTop(el.scrollTop);
      });
    };

    updateSizes();
    setScrollTop(el.scrollTop);

    el.addEventListener("scroll", onScrollInternal, { passive: true } as any);
    window.addEventListener("resize", updateSizes);

    return () => {
      el.removeEventListener("scroll", onScrollInternal as any);
      window.removeEventListener("resize", updateSizes);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // Auto-scroll to the baseline match when requested.
  const lastAutoScrollIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoScrollRequestId) return;
    if (lastAutoScrollIdRef.current === autoScrollRequestId) return;

    const el = containerRef.current;
    if (!el) return;
    if (!baselineCat || !baselineSel) return;
    if (!Array.isArray(items) || items.length === 0) return;

    const matchIndex = items.findIndex((r: any) => {
      const cat = normalizeCatCode(r?.cat ?? "").trim().toUpperCase();
      const sel = normalizeSelCode(r?.sel ?? "").trim().toUpperCase();
      return cat === baselineCat && sel === baselineSel;
    });

    if (matchIndex < 0) return;

    // Center the match in the viewport.
    const targetTop = matchIndex * rowHeightPx - Math.floor(el.clientHeight / 2);
    el.scrollTop = Math.max(0, targetTop);

    lastAutoScrollIdRef.current = autoScrollRequestId;
  }, [autoScrollRequestId, baselineCat, baselineSel, items, rowHeightPx]);

  const windowed = useMemo(() => {
    const total = items.length;
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeightPx) + overscan * 2);

    const rawStartIndex = Math.max(0, Math.floor(scrollTop / rowHeightPx) - overscan);
    const maxStartIndex = Math.max(0, total - visibleCount);
    const startIndex = Math.min(maxStartIndex, rawStartIndex);
    const endIndex = Math.min(total, startIndex + visibleCount);

    const topPad = startIndex * rowHeightPx;
    const bottomPad = (total - endIndex) * rowHeightPx;
    const windowItems = items.slice(startIndex, endIndex);

    return { total, topPad, bottomPad, windowItems };
  }, [items, overscan, rowHeightPx, scrollTop, viewportHeight]);

  return (
    <div
      ref={containerRef}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "auto",
        flex: 1,
        minHeight: 420,

        // Add a right-side buffer so the scrollbar doesn't cover
        // the last column controls (macOS overlay scrollbars).
        paddingRight: 18,
        paddingBottom: 6,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f9fafb" }}>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Cat
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Sel
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Description
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Unit
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Unit Price
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            >
              Line Total
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#f9fafb",
              }}
            />
          </tr>
        </thead>
        <tbody>
          {windowed.topPad > 0 && (
            <tr aria-hidden>
              <td colSpan={7} style={{ height: windowed.topPad, padding: 0 }} />
            </tr>
          )}

          {windowed.windowItems.map((r: any) => {
            const cat = normalizeCatCode(r?.cat ?? "").trim().toUpperCase();
            const sel = normalizeSelCode(r?.sel ?? "").trim().toUpperCase();
            const isMatch =
              baselineCat && baselineSel && cat === baselineCat && sel === baselineSel;

            const unitPrice = Number(r?.unitPrice ?? 0);
            const lineTotal = !Number.isNaN(qty) ? qty * unitPrice : 0;

            return (
              <tr
                key={r.id}
                style={{
                  background: isMatch ? "#dcfce7" : "transparent",
                  height: rowHeightPx,
                }}
              >
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.cat ?? ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.sel ?? ""}
                </td>
                <td
                  title={r.description ?? ""}
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 620,
                  }}
                >
                  {r.description ?? ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.unit ?? ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(r.unitPrice ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #2563eb",
                      background: "#eff6ff",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "#1d4ed8",
                    }}
                  >
                    Select
                  </button>
                </td>
              </tr>
            );
          })}

          {windowed.bottomPad > 0 && (
            <tr aria-hidden>
              <td colSpan={7} style={{ height: windowed.bottomPad, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
