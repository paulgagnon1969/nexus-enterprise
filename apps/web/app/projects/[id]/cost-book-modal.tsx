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
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [catDropdownQuery, setCatDropdownQuery] = useState<string>("");
  const catDropdownRef = useRef<HTMLDivElement | null>(null);
  const catButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runSearch("user");
    }
  };

  const handleSearchInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

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

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!catDropdownOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const el = catDropdownRef.current;
      const target = e.target as Node | null;
      if (el && target && el.contains(target)) return;
      setCatDropdownOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [catDropdownOpen]);

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
    const q = catDropdownQuery.trim().toUpperCase();
    if (!q) return catOptions;
    return catOptions.filter((c) => c.includes(q));
  }, [catDropdownQuery, catOptions]);

  const catSelectionLabel = useMemo(() => {
    if (catFilters.length === 0) return "(any)";
    if (catFilters.length <= 3) return catFilters.join(", ");
    return `${catFilters.slice(0, 3).join(", ")} +${catFilters.length - 3}`;
  }, [catFilters]);

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

  // Initialize state when modal opens.
  useEffect(() => {
    if (!open) return;

    const initialCats = baselineCat ? [baselineCat] : [];

    setCatFilters(initialCats);
    setCatDropdownQuery("");
    setCatDropdownOpen(false);

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

    // Focus CAT selector first so Tab flows CAT → SEL → Description → Qty.
    window.setTimeout(() => {
      if (catButtonRef.current) {
        catButtonRef.current.focus();
      }
    }, 0);
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

        <div
          style={{
            padding: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: 1,
          }}
        >
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 10,
              background: "#f9fafb",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Current line (baseline)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 90px 1fr",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div style={{ color: "#6b7280" }}>CAT</div>
              <div style={{ fontWeight: 600 }}>{baseline.cat ?? ""}</div>
              <div style={{ color: "#6b7280" }}>SEL</div>
              <div style={{ fontWeight: 600 }}>{baseline.sel ?? ""}</div>
              <div style={{ color: "#6b7280" }}>Description</div>
              <div style={{ gridColumn: "span 3", fontWeight: 600 }}>
                {baseline.description ?? ""}
              </div>
              <div style={{ color: "#6b7280" }}>Qty</div>
              <div style={{ fontWeight: 600 }}>{baseline.qty ?? ""}</div>
              <div style={{ color: "#6b7280" }}>Unit Cost</div>
              <div style={{ fontWeight: 600 }}>{baseline.unitCost ?? ""}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "200px 200px 1fr 110px 110px",
              gap: 8,
              alignItems: "end",
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                CAT
                <span style={{ marginLeft: 6, color: "#9ca3af" }}>
                  ({allCats.length || "?"})
                </span>
              </div>

              <div
                ref={catDropdownRef}
                style={{ position: "relative" }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  ref={catButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCatDropdownOpen((prev) => !prev);
                  }}
                  style={{
                    width: "100%",
                    // +20px taller hit-area vs the other inputs.
                    padding: "16px 8px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                    background: "#ffffff",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    cursor: "pointer",
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={catDropdownOpen}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {catSelectionLabel}
                  </span>
                  <span style={{ color: "#6b7280" }}>
                    {catDropdownOpen ? "▴" : "▾"}
                  </span>
                </button>

                {catDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
                      overflow: "hidden",
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        padding: 8,
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      <input
                        value={catDropdownQuery}
                        onChange={(e) => setCatDropdownQuery(e.target.value)}
                        placeholder="Filter CATs…"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          justifyContent: "space-between",
                          marginTop: 8,
                          fontSize: 11,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCatFilters([]);
                            setCatDropdownQuery("");
                          }}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            background: "#ffffff",
                            cursor: "pointer",
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
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            background: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          Select filtered
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        maxHeight: 520,
                        overflow: "auto",
                        padding: 8,
                        background: "#ffffff",
                      }}
                    >
                      {filteredCatOptions.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          No CATs match.
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {filteredCatOptions.map((cat) => {
                            const checked = catFilters.includes(cat);
                            return (
                              <label
                                key={cat}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  // +20px taller row for easier clicking.
                                  padding: "12px 4px",
                                  borderRadius: 6,
                                  cursor: "pointer",
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
                                />
                                <span
                                  style={{
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                  }}
                                >
                                  {cat}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>SEL</div>
              <input
                ref={selInputRef}
                placeholder="(any)"
                list="costbook-sel-options"
                onKeyDown={handleSearchInputKeyDown}
                onFocus={handleSearchInputFocus}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                Description
              </div>
              <input
                ref={descInputRef}
                placeholder="Search description"
                onKeyDown={handleSearchInputKeyDown}
                onFocus={handleSearchInputFocus}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Qty</div>
              <input
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                onFocus={handleSearchInputFocus}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void runSearch("user")}
                disabled={searching}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: searching ? "default" : "pointer",
                  fontSize: 12,
                  opacity: searching ? 0.7 : 1,
                }}
              >
                {searching ? "Searching..." : "Search"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCatFilters(baselineCat ? [baselineCat] : []);
                  setCatDropdownQuery("");
                  setCatDropdownOpen(false);
                  if (selInputRef.current) selInputRef.current.value = "";
                  if (descInputRef.current) descInputRef.current.value = "";
                  void runSearch("auto", baselineCat ? [baselineCat] : []);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
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
  );
}
