"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusyOverlay } from "../../busy-overlay-context";
import { CostBookResultsTable } from "./cost-book-results-table";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

export function CostBookModal(props: {
  open: boolean;
  baseline: {
    cat: string;
    sel: string;
    description: string;
    qty: number | null;
    unitCost: number | string | null;
  };
  onRequestClose: () => void;
  onSelectLine: (params: { companyPriceListItemId: string; qty: number }) => void;
}) {
  const { open, baseline, onRequestClose, onSelectLine } = props;

  const busyOverlay = useBusyOverlay();

  // CAT multi-select (stateful)
  const [catFilters, setCatFilters] = useState<string[]>([]);
  const catFiltersRef = useRef<string[]>([]);
  const [catPanelWidth, setCatPanelWidth] = useState(180);
  const [catFilterQuery, setCatFilterQuery] = useState<string>("");
  const catPanelResizing = useRef(false);

  // Uncontrolled search inputs (for smooth typing)
  const selInputRef = useRef<HTMLInputElement | null>(null);
  const descInputRef = useRef<HTMLInputElement | null>(null);

  // Qty is used live to compute line totals, so keep it controlled locally.
  const [qtyStr, setQtyStr] = useState<string>("1");

  const [allCats, setAllCats] = useState<string[]>([]);
  const [allCatsError, setAllCatsError] = useState<string | null>(null);

  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSeq, setSearchSeq] = useState(0);

  const baselineCat = useMemo(
    () => normalizeCatCode(baseline.cat).trim().toUpperCase(),
    [baseline.cat],
  );
  const baselineSel = useMemo(
    () => normalizeSelCode(baseline.sel).trim().toUpperCase(),
    [baseline.sel],
  );

  // Keep latest CAT selection in a ref so searches don't need to rebind on each change.
  useEffect(() => {
    catFiltersRef.current = catFilters;
  }, [catFilters]);

  // Handle CAT panel resize via mouse drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!catPanelResizing.current) return;
      const newWidth = Math.max(120, Math.min(400, e.clientX - 16));
      setCatPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      catPanelResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const catOptions = useMemo(() => {
    const raw = Array.from(
      new Set([
        baselineCat,
        ...allCats,
        ...results.map((r: any) => normalizeCatCode(r?.cat ?? "").trim().toUpperCase()),
      ].filter(Boolean)),
    );

    return raw.sort().slice(0, 1000);
  }, [allCats, baselineCat, results]);

  const filteredCatOptions = useMemo(() => {
    const q = catFilterQuery.trim().toUpperCase();
    if (!q) return catOptions;
    return catOptions.filter((c) => c.includes(q));
  }, [catFilterQuery, catOptions]);

  const loadCats = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setAllCatsError("Missing access token. Please login again.");
      return;
    }

    setAllCatsError(null);

    try {
      const res = await fetch(`${API_BASE}/pricing/company-price-list/cats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setAllCatsError(`Failed to load CAT list (${res.status}) ${text}`);
        return;
      }

      const json: any = await res.json().catch(() => null);
      const cats = Array.isArray(json?.cats) ? json.cats : [];
      setAllCats(
        cats
          .map((c: any) => normalizeCatCode(c).trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 1000),
      );
    } catch (err: any) {
      setAllCatsError(err?.message ?? "Failed to load CAT list");
    }
  }, []);

  const runSearch = useCallback(
    async (mode: "auto" | "user", catsOverride?: string[]) => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setSearchError("Missing access token. Please login again.");
        return;
      }

      const query =
        mode === "auto" ? "" : (descInputRef.current?.value ?? "").trim();
      const sel =
        mode === "auto" ? "" : (selInputRef.current?.value ?? "").trim();

      const catsToUse = Array.isArray(catsOverride) ? catsOverride : catFiltersRef.current;
      const hasCats = catsToUse.length > 0;
      const limit =
        mode === "auto"
          ? 2000
          : hasCats && !query && !sel
            ? 2000
            : 200;

      setSearching(true);
      setSearchError(null);

      try {
        await busyOverlay.run(
          mode === "auto" ? "Loading cost book…" : "Searching cost book…",
          async () => {
            const body: any = {
              query,
              cats: hasCats ? catsToUse : undefined,
              sel: sel || undefined,
              limit,
            };

            const res = await fetch(`${API_BASE}/pricing/company-price-list/search`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              setSearchError(`Search failed (${res.status}) ${text}`);
              setResults([]);
              return;
            }

            const json: any = await res.json();
            setResults(Array.isArray(json.items) ? json.items : []);
            setSearchSeq((prev) => prev + 1);
          },
        );
      } catch (err: any) {
        setSearchError(err?.message ?? "Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [busyOverlay],
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runSearch("user");
    }
  };

  // Initialize state when modal opens.
  useEffect(() => {
    if (!open) return;

    const initialCats = baselineCat ? [baselineCat] : [];

    setCatFilters(initialCats);
    setCatFilterQuery("");

    setResults([]);
    setSearchError(null);

    const nextQty =
      typeof baseline.qty === "number" && Number.isFinite(baseline.qty)
        ? String(baseline.qty)
        : "1";
    setQtyStr(nextQty);

    if (selInputRef.current) selInputRef.current.value = "";
    if (descInputRef.current) descInputRef.current.value = "";

    // Load CAT list (best effort) and auto-load results.
    if (allCats.length === 0 && !allCatsError) {
      void loadCats();
    }

    // Auto-load a large slice so the user can scroll and the baseline row can be highlighted.
    void runSearch("auto", initialCats);
  }, [open, baseline.qty, baselineCat, allCats.length, allCatsError, loadCats, runSearch]);

  const qty = useMemo(() => Number(qtyStr), [qtyStr]);

  const handleSelect = useCallback(
    (companyPriceListItemId: string) => {
      const n = Number(qtyStr);
      if (Number.isNaN(n) || n <= 0) {
        alert("Qty must be a positive number");
        return;
      }
      onSelectLine({ companyPriceListItemId, qty: n });
    },
    [onSelectLine, qtyStr],
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onRequestClose}
    >
      <div
        style={{
          width: "min(1300px, 98vw)",
          height: "92vh",
          maxHeight: "92vh",
          overflow: "hidden",
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 12px 32px rgba(15,23,42,0.25)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Cost Book</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Select a replacement line item for this reconciliation.
            </div>
          </div>
          <button
            type="button"
            onClick={onRequestClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close cost book modal"
          >
            ×
          </button>
        </div>

        {/* Main content area: CAT sidebar + results */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* CAT Filter Sidebar - full height, resizable */}
          <div
            style={{
              width: catPanelWidth,
              minWidth: 120,
              maxWidth: 400,
              borderRight: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              background: "#f9fafb",
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                CAT Filter
                <span style={{ marginLeft: 6, fontWeight: 400, color: "#9ca3af" }}>
                  ({filteredCatOptions.length})
                </span>
              </div>
              <input
                value={catFilterQuery}
                onChange={(e) => setCatFilterQuery(e.target.value)}
                placeholder="Search CATs…"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 11,
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setCatFilters([]);
                    void runSearch("auto", []);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: 10,
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatFilters([...filteredCatOptions]);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: 10,
                  }}
                >
                  All
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
              {filteredCatOptions.length === 0 ? (
                <div style={{ padding: "12px 10px", fontSize: 11, color: "#6b7280" }}>
                  No CATs match.
                </div>
              ) : (
                filteredCatOptions.map((cat) => {
                  const checked = catFilters.includes(cat);
                  return (
                    <label
                      key={cat}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                        background: checked ? "#dbeafe" : "transparent",
                        borderLeft: checked ? "3px solid #2563eb" : "3px solid transparent",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          setCatFilters((prev) => {
                            const next = new Set(prev);
                            if (nextChecked) next.add(cat);
                            else next.delete(cat);
                            return Array.from(next).sort();
                          });
                        }}
                        style={{ accentColor: "#2563eb" }}
                      />
                      <span
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          fontWeight: checked ? 600 : 400,
                        }}
                      >
                        {cat}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#6b7280" }}>
              {catFilters.length > 0 ? `${catFilters.length} selected` : "All CATs"}
            </div>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={() => {
              catPanelResizing.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            style={{
              width: 6,
              cursor: "col-resize",
              background: "#e5e7eb",
              flexShrink: 0,
            }}
            title="Drag to resize CAT panel"
          />

          {/* Right side: baseline + filters + results */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: 12,
              gap: 10,
            }}
          >
            {/* Baseline info - compact */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 8,
                background: "#f9fafb",
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div><span style={{ color: "#6b7280" }}>CAT:</span> <strong>{baseline.cat ?? ""}</strong></div>
                <div><span style={{ color: "#6b7280" }}>SEL:</span> <strong>{baseline.sel ?? ""}</strong></div>
                <div><span style={{ color: "#6b7280" }}>Qty:</span> <strong>{baseline.qty ?? ""}</strong></div>
                <div><span style={{ color: "#6b7280" }}>Unit:</span> <strong>{baseline.unitCost ?? ""}</strong></div>
                <div style={{ flex: 1 }}><span style={{ color: "#6b7280" }}>Desc:</span> <strong>{baseline.description ?? ""}</strong></div>
              </div>
            </div>

            {/* Search filters row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 80px 140px",
                gap: 8,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>SEL</div>
                <input
                  ref={selInputRef}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="(any)"
                  list="costbook-sel-options"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Description</div>
                <input
                  ref={descInputRef}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search description"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Qty</div>
                <input
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void runSearch("user")}
                  disabled={searching}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #2563eb",
                    background: "#2563eb",
                    color: "#ffffff",
                    cursor: searching ? "default" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: searching ? 0.7 : 1,
                  }}
                >
                  {searching ? "…" : "Search"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCatFilters(baselineCat ? [baselineCat] : []);
                    setCatFilterQuery("");
                    if (selInputRef.current) selInputRef.current.value = "";
                    if (descInputRef.current) descInputRef.current.value = "";
                    void runSearch("auto", baselineCat ? [baselineCat] : []);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

          <datalist id="costbook-sel-options">
            {Array.from(
              new Set(
                [baseline.sel, ...results.map((r: any) => r?.sel)]
                  .map((v) => String(v ?? "").trim())
                  .filter(Boolean),
              ),
            )
              .sort()
              .slice(0, 250)
              .map((v) => (
                <option key={v} value={v} />
              ))}
          </datalist>

          {allCatsError && (
            <div style={{ marginBottom: 10, color: "#b91c1c", fontSize: 12 }}>
              {allCatsError}
            </div>
          )}

          {searchError && (
            <div style={{ marginBottom: 10, color: "#b91c1c", fontSize: 12 }}>
              {searchError}
            </div>
          )}

          {!searching && results.length === 0 && !searchError && (
            <div style={{ marginBottom: 10, color: "#6b7280", fontSize: 12 }}>
              No results yet — click Search.
            </div>
          )}

            <CostBookResultsTable
              items={results}
              qty={Number.isFinite(qty) ? qty : 0}
              baselineCat={baselineCat}
              baselineSel={baselineSel}
              onSelect={handleSelect}
              autoScrollRequestId={`${baselineCat}:${baselineSel}:${searchSeq}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
