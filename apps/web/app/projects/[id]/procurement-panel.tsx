"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  specHash: string;
  category: string;
  productType: string | null;
  description: string;
  unit: string;
  width: string | null;
  height: string | null;
  depth: string | null;
  finish: string | null;
  specJson: Record<string, any> | null;
  createdAt: string;
}

interface VendorQuote {
  vendorCode: string;
  vendorName: string;
  vendorSku: string | null;
  unitPrice: number | null;
  inStock: boolean | null;
  leadTimeDays: number | null;
  productUrl: string | null;
  scrapedAt: string;
  isBest: boolean;
}

interface ComparisonRow {
  catalogItemId: string;
  specHash: string;
  description: string;
  category: string;
  unit: string;
  quotes: VendorQuote[];
  bestPrice: number | null;
  bestVendor: string | null;
}

interface Vendor {
  id: string;
  code: string;
  name: string;
  websiteUrl: string | null;
  providerType: string;
  isEnabled: boolean;
  scrapeConfig: Record<string, any> | null;
  rateLimit: Record<string, any> | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}

const fmt = (v: number | null | undefined, digits = 2) =>
  v != null ? `$${v.toLocaleString(undefined, { maximumFractionDigits: digits })}` : "—";

// ─── Sub-view type ───────────────────────────────────────────────────────────

type ProcureView = "catalog" | "compare" | "vendors";

// ─── Component ───────────────────────────────────────────────────────────────

export function ProcurementPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ProcureView>("catalog");

  // Catalog browse state
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogLimit = 50;

  // Selection for comparison
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Comparison grid state
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // Vendor registry state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [vendorsSeedMessage, setVendorsSeedMessage] = useState<string | null>(null);

  // Shop state (live re-scrape)
  const [shopLoading, setShopLoading] = useState<Set<string>>(new Set());
  const [shopResults, setShopResults] = useState<Record<string, any>>({});

  // ── Catalog fetch ────────────────────────────────────────────────────────

  const loadCatalog = useCallback(async (search: string, category: string, offset: number) => {
    const token = getToken();
    if (!token) { setCatalogError("Missing access token."); return; }

    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category.trim()) params.set("category", category.trim());
      params.set("limit", String(catalogLimit));
      params.set("offset", String(offset));

      const res = await fetch(`${API_BASE}/supplier-catalog/catalog?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to load catalog (${res.status}). ${text}`.slice(0, 300));
      }

      const json = await res.json();
      setCatalogItems(json.items ?? []);
      setCatalogTotal(json.total ?? 0);
    } catch (err: any) {
      setCatalogError(err?.message ?? "Failed to load catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "catalog") {
      loadCatalog(catalogSearch, catalogCategory, catalogOffset);
    }
  }, [view, catalogOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vendors fetch ────────────────────────────────────────────────────────

  const loadVendors = useCallback(async () => {
    const token = getToken();
    if (!token) { setVendorsError("Missing access token."); return; }

    setVendorsLoading(true);
    setVendorsError(null);

    try {
      const res = await fetch(`${API_BASE}/supplier-catalog/vendors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load vendors (${res.status})`);
      const json = await res.json();
      setVendors(json.vendors ?? []);
    } catch (err: any) {
      setVendorsError(err?.message ?? "Failed to load vendors.");
    } finally {
      setVendorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "vendors") loadVendors();
  }, [view, loadVendors]);

  // ── Comparison grid ──────────────────────────────────────────────────────

  const loadComparison = useCallback(async (ids: string[]) => {
    const token = getToken();
    if (!token) { setComparisonError("Missing access token."); return; }

    setComparisonLoading(true);
    setComparisonError(null);

    try {
      const res = await fetch(`${API_BASE}/supplier-catalog/catalog/compare`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ catalogItemIds: ids }),
      });
      if (!res.ok) throw new Error(`Comparison failed (${res.status})`);
      const rows: ComparisonRow[] = await res.json();
      setComparisonRows(rows);
    } catch (err: any) {
      setComparisonError(err?.message ?? "Failed to load comparison.");
    } finally {
      setComparisonLoading(false);
    }
  }, []);

  // Auto-load comparison when switching to compare view with selections
  useEffect(() => {
    if (view === "compare" && selectedIds.size > 0) {
      loadComparison(Array.from(selectedIds));
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shop (live scrape) ───────────────────────────────────────────────────

  const shopForItem = useCallback(async (catalogItemId: string) => {
    const token = getToken();
    if (!token) return;

    setShopLoading((prev) => new Set(prev).add(catalogItemId));

    try {
      const res = await fetch(`${API_BASE}/supplier-catalog/catalog/${catalogItemId}/shop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Shop failed (${res.status})`);
      const result = await res.json();
      setShopResults((prev) => ({ ...prev, [catalogItemId]: result }));
      // Refresh comparison grid after shopping
      if (selectedIds.size > 0) {
        loadComparison(Array.from(selectedIds));
      }
    } catch (err: any) {
      setShopResults((prev) => ({
        ...prev,
        [catalogItemId]: { error: err?.message ?? "Shop failed" },
      }));
    } finally {
      setShopLoading((prev) => {
        const next = new Set(prev);
        next.delete(catalogItemId);
        return next;
      });
    }
  }, [selectedIds, loadComparison]);

  // ── Seed vendors ─────────────────────────────────────────────────────────

  const seedVendors = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setVendorsSeedMessage(null);
    try {
      const res = await fetch(`${API_BASE}/supplier-catalog/vendors/seed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Seed failed (${res.status})`);
      const json = await res.json();
      setVendorsSeedMessage(`Seeded ${json.created ?? 0} vendors (${json.total ?? 0} total).`);
      loadVendors();
    } catch (err: any) {
      setVendorsSeedMessage(err?.message ?? "Seed failed.");
    }
  }, [loadVendors]);

  // ── Toggle selection ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = catalogItems.map((i) => i.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...allIds]));
    }
  };

  // ── Unique vendor codes from comparison grid (for dynamic columns) ──────

  const vendorCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const row of comparisonRows) {
      for (const q of row.quotes) codes.add(q.vendorCode);
    }
    return Array.from(codes).sort();
  }, [comparisonRows]);

  // ── Render ───────────────────────────────────────────────────────────────

  const tabBtn = (key: ProcureView, label: string, badge?: number | string) => (
    <button
      key={key}
      type="button"
      onClick={() => setView(key)}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        border: view === key ? "1px solid #2563eb" : "1px solid #e5e7eb",
        borderRadius: 4,
        background: view === key ? "#2563eb" : "#fff",
        color: view === key ? "#fff" : "#374151",
        cursor: "pointer",
        fontWeight: view === key ? 600 : 400,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      {badge != null && (
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 99,
            background: view === key ? "rgba(255,255,255,0.25)" : "#e5e7eb",
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div>
      {/* Sub-view toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {tabBtn("catalog", "Catalog", catalogTotal || undefined)}
        {tabBtn(
          "compare",
          "Comparison Grid",
          selectedIds.size > 0 ? selectedIds.size : undefined,
        )}
        {tabBtn("vendors", "Vendor Registry")}

        {/* Selection badge + Compare action */}
        {selectedIds.size > 0 && view === "catalog" && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => {
                setView("compare");
                loadComparison(Array.from(selectedIds));
              }}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                border: "none",
                borderRadius: 4,
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Compare Selected
            </button>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CATALOG BROWSE VIEW                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "catalog" && (
        <div>
          {/* Search bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search catalog items…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setCatalogOffset(0);
                  loadCatalog(catalogSearch, catalogCategory, 0);
                }
              }}
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 4,
              }}
            />
            <input
              type="text"
              placeholder="Category"
              value={catalogCategory}
              onChange={(e) => setCatalogCategory(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setCatalogOffset(0);
                  loadCatalog(catalogSearch, catalogCategory, 0);
                }
              }}
              style={{
                width: 120,
                padding: "6px 10px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 4,
              }}
            />
            <button
              type="button"
              onClick={() => {
                setCatalogOffset(0);
                loadCatalog(catalogSearch, catalogCategory, 0);
              }}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                border: "1px solid #2563eb",
                borderRadius: 4,
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Search
            </button>
          </div>

          {catalogLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading catalog…</p>
          )}
          {catalogError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{catalogError}</p>
          )}

          {!catalogLoading && catalogItems.length > 0 && (
            <>
              {/* Results summary */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                <span>
                  Showing {catalogOffset + 1}–{Math.min(catalogOffset + catalogLimit, catalogTotal)} of{" "}
                  {catalogTotal.toLocaleString()} items
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    disabled={catalogOffset === 0}
                    onClick={() => setCatalogOffset(Math.max(0, catalogOffset - catalogLimit))}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      background: "#fff",
                      cursor: catalogOffset === 0 ? "not-allowed" : "pointer",
                      color: catalogOffset === 0 ? "#d1d5db" : "#374151",
                    }}
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    disabled={catalogOffset + catalogLimit >= catalogTotal}
                    onClick={() => setCatalogOffset(catalogOffset + catalogLimit)}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      background: "#fff",
                      cursor:
                        catalogOffset + catalogLimit >= catalogTotal ? "not-allowed" : "pointer",
                      color:
                        catalogOffset + catalogLimit >= catalogTotal ? "#d1d5db" : "#374151",
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>

              {/* Catalog table */}
              <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ background: "#f3f4f6" }}>
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          width: 32,
                          textAlign: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            catalogItems.length > 0 &&
                            catalogItems.every((i) => selectedIds.has(i.id))
                          }
                          onChange={selectAll}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                        Description
                      </th>
                      <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db", width: 90 }}>
                        Category
                      </th>
                      <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db", width: 60 }}>
                        Unit
                      </th>
                      <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db", width: 100 }}>
                        Dimensions
                      </th>
                      <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db", width: 80 }}>
                        Finish
                      </th>
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          width: 100,
                          fontFamily: "monospace",
                          fontSize: 9,
                        }}
                      >
                        Spec Hash
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogItems.map((item) => {
                      const checked = selectedIds.has(item.id);
                      const dims = [item.width, item.height, item.depth]
                        .filter(Boolean)
                        .join(" × ");

                      return (
                        <tr
                          key={item.id}
                          onClick={() => toggleSelect(item.id)}
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            background: checked ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          <td style={{ padding: "6px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelect(item.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td
                            style={{
                              padding: "6px",
                              maxWidth: 360,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.description}
                          >
                            {item.description}
                          </td>
                          <td style={{ padding: "6px", fontWeight: 500 }}>{item.category}</td>
                          <td style={{ padding: "6px", color: "#6b7280" }}>{item.unit}</td>
                          <td style={{ padding: "6px", color: "#6b7280", fontSize: 10 }}>
                            {dims || "—"}
                          </td>
                          <td style={{ padding: "6px", color: "#6b7280", fontSize: 10 }}>
                            {item.finish || "—"}
                          </td>
                          <td
                            style={{
                              padding: "6px",
                              fontFamily: "monospace",
                              fontSize: 8,
                              color: "#9ca3af",
                              maxWidth: 100,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={item.specHash}
                          >
                            {item.specHash.slice(0, 12)}…
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!catalogLoading && catalogItems.length === 0 && !catalogError && (
            <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
              No catalog items found. Import items via the Master Costbook or BWC catalog
              import.
            </p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COMPARISON GRID VIEW                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "compare" && (
        <div>
          {selectedIds.size === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#6b7280",
                fontSize: 13,
              }}
            >
              <p style={{ marginBottom: 8 }}>No items selected for comparison.</p>
              <button
                type="button"
                onClick={() => setView("catalog")}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  border: "1px solid #2563eb",
                  borderRadius: 4,
                  background: "#eff6ff",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Browse Catalog
              </button>
            </div>
          )}

          {comparisonLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading comparison grid…</p>
          )}
          {comparisonError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{comparisonError}</p>
          )}

          {!comparisonLoading && comparisonRows.length > 0 && (
            <>
              {/* Summary banner */}
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginBottom: 16,
                  padding: 12,
                  background: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ color: "#93c5fd", marginBottom: 2 }}>Items Compared</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{comparisonRows.length}</div>
                </div>
                <div>
                  <div style={{ color: "#93c5fd", marginBottom: 2 }}>Vendors</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{vendorCodes.length}</div>
                </div>
                <div>
                  <div style={{ color: "#93c5fd", marginBottom: 2 }}>Items w/ Best Price</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {comparisonRows.filter((r) => r.bestPrice != null).length}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => loadComparison(Array.from(selectedIds))}
                  disabled={comparisonLoading}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.15)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 500,
                    alignSelf: "center",
                  }}
                >
                  Refresh Quotes
                </button>
              </div>

              {/* Grid table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f3f4f6" }}>
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          textAlign: "left",
                          position: "sticky",
                          left: 0,
                          background: "#f3f4f6",
                          zIndex: 2,
                          minWidth: 250,
                        }}
                      >
                        Item
                      </th>
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          textAlign: "left",
                          width: 70,
                        }}
                      >
                        Category
                      </th>
                      {vendorCodes.map((vc) => (
                        <th
                          key={vc}
                          style={{
                            padding: "8px 6px",
                            borderBottom: "2px solid #d1d5db",
                            textAlign: "right",
                            minWidth: 130,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{vc}</div>
                          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 400 }}>
                            Price / Stock
                          </div>
                        </th>
                      ))}
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          textAlign: "right",
                          width: 90,
                          fontWeight: 700,
                          color: "#059669",
                        }}
                      >
                        Best
                      </th>
                      <th
                        style={{
                          padding: "8px 6px",
                          borderBottom: "2px solid #d1d5db",
                          textAlign: "center",
                          width: 60,
                        }}
                      >
                        Shop
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => {
                      const isShopBusy = shopLoading.has(row.catalogItemId);

                      return (
                        <tr
                          key={row.catalogItemId}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                        >
                          {/* Item description (sticky) */}
                          <td
                            style={{
                              padding: "6px",
                              position: "sticky",
                              left: 0,
                              background: "#fff",
                              zIndex: 1,
                              maxWidth: 280,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={row.description}
                          >
                            {row.description}
                          </td>
                          <td style={{ padding: "6px", fontWeight: 500, fontSize: 10 }}>
                            {row.category}
                          </td>

                          {/* Vendor columns */}
                          {vendorCodes.map((vc) => {
                            const quote = row.quotes.find((q) => q.vendorCode === vc);
                            if (!quote) {
                              return (
                                <td
                                  key={vc}
                                  style={{
                                    padding: "6px",
                                    textAlign: "right",
                                    color: "#d1d5db",
                                  }}
                                >
                                  —
                                </td>
                              );
                            }

                            return (
                              <td
                                key={vc}
                                style={{
                                  padding: "6px",
                                  textAlign: "right",
                                  background: quote.isBest ? "#f0fdf4" : "transparent",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: quote.isBest ? 700 : 500,
                                    color: quote.isBest ? "#059669" : "#111827",
                                  }}
                                >
                                  {fmt(quote.unitPrice)}
                                  {quote.isBest && (
                                    <span style={{ marginLeft: 4, fontSize: 9 }}>★</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>
                                  {quote.inStock === true && (
                                    <span style={{ color: "#16a34a" }}>In Stock</span>
                                  )}
                                  {quote.inStock === false && (
                                    <span style={{ color: "#dc2626" }}>Out of Stock</span>
                                  )}
                                  {quote.leadTimeDays != null && (
                                    <span style={{ marginLeft: 4 }}>
                                      {quote.leadTimeDays}d lead
                                    </span>
                                  )}
                                </div>
                                {quote.productUrl && (
                                  <a
                                    href={quote.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: 8,
                                      color: "#2563eb",
                                      textDecoration: "none",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    view →
                                  </a>
                                )}
                              </td>
                            );
                          })}

                          {/* Best price */}
                          <td
                            style={{
                              padding: "6px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "#059669",
                            }}
                          >
                            {fmt(row.bestPrice)}
                            {row.bestVendor && (
                              <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 400 }}>
                                {row.bestVendor}
                              </div>
                            )}
                          </td>

                          {/* Shop button */}
                          <td style={{ padding: "6px", textAlign: "center" }}>
                            <button
                              type="button"
                              disabled={isShopBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                shopForItem(row.catalogItemId);
                              }}
                              style={{
                                padding: "3px 8px",
                                fontSize: 10,
                                border: "1px solid #d1d5db",
                                borderRadius: 4,
                                background: isShopBusy ? "#f3f4f6" : "#fff",
                                cursor: isShopBusy ? "wait" : "pointer",
                                color: "#374151",
                              }}
                              title="Live scrape all vendors for fresh quotes"
                            >
                              {isShopBusy ? "…" : "Shop"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VENDOR REGISTRY VIEW                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "vendors" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={seedVendors}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 4,
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Seed Default Vendors
            </button>
            <button
              type="button"
              onClick={loadVendors}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 4,
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            {vendorsSeedMessage && (
              <span style={{ fontSize: 11, color: "#059669" }}>{vendorsSeedMessage}</span>
            )}
          </div>

          {vendorsLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading vendors…</p>
          )}
          {vendorsError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{vendorsError}</p>
          )}

          {!vendorsLoading && vendors.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                      Code
                    </th>
                    <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                      Name
                    </th>
                    <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                      Website
                    </th>
                    <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                      Provider
                    </th>
                    <th
                      style={{
                        padding: "8px 6px",
                        borderBottom: "2px solid #d1d5db",
                        textAlign: "center",
                      }}
                    >
                      Enabled
                    </th>
                    <th style={{ padding: "8px 6px", borderBottom: "2px solid #d1d5db" }}>
                      Rate Limit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px", fontWeight: 600, fontFamily: "monospace" }}>
                        {v.code}
                      </td>
                      <td style={{ padding: "6px" }}>{v.name}</td>
                      <td style={{ padding: "6px" }}>
                        {v.websiteUrl ? (
                          <a
                            href={v.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#2563eb", textDecoration: "none", fontSize: 10 }}
                          >
                            {v.websiteUrl.replace(/^https?:\/\//, "").slice(0, 35)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "6px" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            background:
                              v.providerType === "WEB_SCRAPER"
                                ? "#fef3c7"
                                : v.providerType === "SERPAPI"
                                  ? "#dbeafe"
                                  : v.providerType === "BIGBOX"
                                    ? "#ede9fe"
                                    : "#f3f4f6",
                            color:
                              v.providerType === "WEB_SCRAPER"
                                ? "#92400e"
                                : v.providerType === "SERPAPI"
                                  ? "#1e40af"
                                  : v.providerType === "BIGBOX"
                                    ? "#5b21b6"
                                    : "#374151",
                          }}
                        >
                          {v.providerType}
                        </span>
                      </td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: v.isEnabled ? "#16a34a" : "#dc2626",
                          }}
                          title={v.isEnabled ? "Enabled" : "Disabled"}
                        />
                      </td>
                      <td style={{ padding: "6px", color: "#6b7280", fontSize: 10 }}>
                        {v.rateLimit
                          ? `${(v.rateLimit as any).delayMs ?? "—"}ms / ${(v.rateLimit as any).maxRetries ?? "—"} retries`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!vendorsLoading && vendors.length === 0 && !vendorsError && (
            <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
              No vendors registered yet. Click &quot;Seed Default Vendors&quot; to initialize RTA,
              USKitchen, Home Depot, and Lowe&apos;s.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
