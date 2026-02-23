"use client";

import { useState, useCallback, useRef } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types (mirror backend CatalogProduct / CatalogSearchResult)
// ---------------------------------------------------------------------------

interface CatalogProduct {
  productId: string;
  provider: string;
  title: string;
  description?: string;
  brand?: string;
  modelNumber?: string;
  upc?: string;
  storeSku?: string;
  imageUrl?: string;
  productUrl?: string;
  price?: number;
  wasPrice?: number;
  unit?: string;
  aisle?: string;
  inStock?: boolean;
  rating?: number;
  inferredCatCode?: string;
}

interface CatalogSearchResult {
  provider: string;
  query: string;
  totalResults: number;
  page: number;
  products: CatalogProduct[];
}

interface CostBookComparison {
  catalogProduct: CatalogProduct;
  costBookMatch: {
    cat: string | null;
    sel: string | null;
    description: string | null;
    unitPrice: number | null;
    lastKnownUnitPrice: number | null;
  } | null;
  delta: number | null;
  deltaPercent: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("accessToken")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function usd(n: number | undefined | null): string {
  if (n == null) return "—";
  return "$" + n.toFixed(2);
}

function stars(rating: number | undefined | null): string {
  if (rating == null) return "";
  return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SupplierCatalogPage() {
  // Search state
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState("78130");
  const [provider, setProvider] = useState("homedepot");
  const [page, setPage] = useState(1);

  // Results
  const [results, setResults] = useState<CatalogSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Product detail
  const [selectedProduct, setSelectedProduct] =
    useState<CatalogProduct | null>(null);

  // CostBook comparison
  const [comparison, setComparison] = useState<CostBookComparison | null>(null);
  const [comparingId, setComparingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- search ----
  const doSearch = useCallback(
    async (p: number = 1) => {
      if (!query.trim()) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      setError(null);
      setSelectedProduct(null);
      setComparison(null);
      setPage(p);

      try {
        const qs = new URLSearchParams({
          provider,
          q: query.trim(),
          page: String(p),
        });
        if (zip.trim()) qs.set("zip", zip.trim());

        const data = await apiFetch<CatalogSearchResult>(
          `/supplier-catalog/search?${qs}`,
        );
        if (ac.signal.aborted) return;
        setResults(data);
      } catch (e: any) {
        if (!ac.signal.aborted) setError(e?.message ?? "Search failed");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [query, zip, provider],
  );

  // ---- compare ----
  const doCompare = useCallback(
    async (product: CatalogProduct) => {
      setComparingId(product.productId);
      setComparison(null);
      try {
        const qs = new URLSearchParams({
          provider: product.provider,
          id: product.productId,
        });
        if (zip.trim()) qs.set("zip", zip.trim());
        const data = await apiFetch<CostBookComparison>(
          `/supplier-catalog/compare?${qs}`,
        );
        setComparison(data);
      } catch {
        // silently ignore — compare is best-effort
      } finally {
        setComparingId(null);
      }
    },
    [zip],
  );

  // ---- pagination ----
  const totalPages = results
    ? Math.ceil(results.totalResults / Math.max(results.products.length, 1))
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Header ── */}
      <div
        className="app-card"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Supplier Catalog
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Search Home Depot &amp; Lowe's product data — compare against your
              CostBook.
            </p>
          </div>
        </div>

        {/* ── Search bar ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSearch(1);
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 13,
              background: "#f9fafb",
              minWidth: 140,
            }}
          >
            <option value="homedepot">Home Depot</option>
            <option value="lowes">Lowe&apos;s</option>
          </select>

          <input
            type="text"
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />

          <input
            type="text"
            placeholder="ZIP code"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            style={{
              width: 90,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />

          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#93c5fd" : "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="app-card"
          style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#991b1b" }}>
            {error}
          </p>
        </div>
      )}

      {/* ── Results ── */}
      {results && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Product grid */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                color: "#6b7280",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {results.totalResults.toLocaleString()} results for &ldquo;
                {results.query}&rdquo;
              </span>
              {totalPages > 1 && (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    disabled={page <= 1}
                    onClick={() => doSearch(page - 1)}
                    style={paginationBtnStyle(page <= 1)}
                  >
                    ‹ Prev
                  </button>
                  <span style={{ fontSize: 12 }}>
                    Page {page}
                    {totalPages > 0 ? ` of ${totalPages}` : ""}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => doSearch(page + 1)}
                    style={paginationBtnStyle(page >= totalPages)}
                  >
                    Next ›
                  </button>
                </span>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {results.products.map((p) => (
                <ProductCard
                  key={p.productId}
                  product={p}
                  selected={selectedProduct?.productId === p.productId}
                  onSelect={() => {
                    setSelectedProduct(p);
                    setComparison(null);
                  }}
                />
              ))}
            </div>

            {results.products.length === 0 && !loading && (
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
                No products found. Try a different search.
              </p>
            )}
          </div>

          {/* Detail panel (shown when a product is selected) */}
          {selectedProduct && (
            <div
              className="app-card"
              style={{
                width: 340,
                flexShrink: 0,
                position: "sticky",
                top: 16,
                maxHeight: "calc(100vh - 120px)",
                overflow: "auto",
              }}
            >
              <ProductDetail
                product={selectedProduct}
                comparison={comparison}
                comparing={comparingId === selectedProduct.productId}
                onCompare={() => doCompare(selectedProduct)}
                onClose={() => {
                  setSelectedProduct(null);
                  setComparison(null);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!results && !loading && !error && (
        <div
          className="app-card"
          style={{ textAlign: "center", padding: "40px 20px" }}
        >
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
              margin: 0,
            }}
          >
            Enter a search term above to browse supplier products.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProductCard({
  product,
  selected,
  onSelect,
}: {
  product: CatalogProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: selected ? "#eff6ff" : "#fff",
        border: selected ? "2px solid #2563eb" : "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt=""
          style={{
            width: "100%",
            height: 120,
            objectFit: "contain",
            borderRadius: 6,
            background: "#f9fafb",
          }}
        />
      )}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: "1.35",
        }}
      >
        {product.title}
      </span>
      <span style={{ fontSize: 11, color: "#6b7280" }}>
        {product.brand ?? ""}
        {product.modelNumber ? ` · ${product.modelNumber}` : ""}
      </span>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          {usd(product.price)}
        </span>
        {product.rating != null && (
          <span style={{ fontSize: 11, color: "#f59e0b" }}>
            {stars(product.rating)}{" "}
            <span style={{ color: "#9ca3af" }}>
              {product.rating.toFixed(1)}
            </span>
          </span>
        )}
      </span>
      {product.wasPrice != null && product.wasPrice > (product.price ?? 0) && (
        <span style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through" }}>
          Was {usd(product.wasPrice)}
        </span>
      )}
    </button>
  );
}

function ProductDetail({
  product,
  comparison,
  comparing,
  onCompare,
  onClose,
}: {
  product: CatalogProduct;
  comparison: CostBookComparison | null;
  comparing: boolean;
  onCompare: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", flex: 1 }}
        >
          {product.title}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#9ca3af",
            padding: "0 0 0 8px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 180,
            objectFit: "contain",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        />
      )}

      <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
        {usd(product.price)}
        {product.unit && (
          <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>
            {" "}
            / {product.unit}
          </span>
        )}
      </div>

      {product.wasPrice != null && product.wasPrice > (product.price ?? 0) && (
        <span
          style={{
            fontSize: 12,
            color: "#dc2626",
            background: "#fef2f2",
            borderRadius: 6,
            padding: "2px 8px",
            alignSelf: "flex-start",
          }}
        >
          Was {usd(product.wasPrice)} — Save{" "}
          {usd((product.wasPrice ?? 0) - (product.price ?? 0))}
        </span>
      )}

      {product.rating != null && (
        <span style={{ fontSize: 13, color: "#f59e0b" }}>
          {stars(product.rating)}{" "}
          <span style={{ color: "#6b7280" }}>{product.rating.toFixed(1)}</span>
        </span>
      )}

      {/* Meta rows */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "4px 12px",
          fontSize: 12,
          color: "#374151",
        }}
      >
        {product.brand && (
          <>
            <span style={{ color: "#9ca3af" }}>Brand</span>
            <span>{product.brand}</span>
          </>
        )}
        {product.modelNumber && (
          <>
            <span style={{ color: "#9ca3af" }}>Model</span>
            <span>{product.modelNumber}</span>
          </>
        )}
        {product.upc && (
          <>
            <span style={{ color: "#9ca3af" }}>UPC</span>
            <span>{product.upc}</span>
          </>
        )}
        {product.storeSku && (
          <>
            <span style={{ color: "#9ca3af" }}>SKU</span>
            <span>{product.storeSku}</span>
          </>
        )}
        {product.aisle && (
          <>
            <span style={{ color: "#9ca3af" }}>Aisle</span>
            <span>{product.aisle}</span>
          </>
        )}
        {product.inStock != null && (
          <>
            <span style={{ color: "#9ca3af" }}>Stock</span>
            <span
              style={{
                color: product.inStock ? "#16a34a" : "#dc2626",
                fontWeight: 600,
              }}
            >
              {product.inStock ? "In Stock" : "Out of Stock"}
            </span>
          </>
        )}
      </div>

      {/* Link to retailer page */}
      {product.productUrl && (
        <a
          href={product.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: "#2563eb",
            textDecoration: "none",
          }}
        >
          View on {product.provider === "homedepot" ? "HomeDepot.com" : "Lowes.com"} ↗
        </a>
      )}

      {/* ── CostBook Compare ── */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: 12,
          marginTop: 4,
        }}
      >
        <button
          type="button"
          onClick={onCompare}
          disabled={comparing}
          style={{
            width: "100%",
            padding: "8px 0",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: comparing ? "#f3f4f6" : "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: comparing ? "default" : "pointer",
            color: "#374151",
          }}
        >
          {comparing ? "Comparing…" : "Compare to CostBook"}
        </button>

        {comparison && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 8,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              fontSize: 12,
            }}
          >
            {comparison.costBookMatch ? (
              <>
                <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4 }}>
                  CostBook Match
                </div>
                <div style={{ color: "#374151" }}>
                  {comparison.costBookMatch.cat}
                  {comparison.costBookMatch.sel
                    ? ` / ${comparison.costBookMatch.sel}`
                    : ""}
                </div>
                <div style={{ color: "#6b7280", marginTop: 2 }}>
                  {comparison.costBookMatch.description}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                  <span>
                    CostBook:{" "}
                    <strong>{usd(comparison.costBookMatch.unitPrice)}</strong>
                  </span>
                  <span>
                    Catalog: <strong>{usd(product.price)}</strong>
                  </span>
                </div>
                {comparison.delta != null && (
                  <div
                    style={{
                      marginTop: 4,
                      fontWeight: 600,
                      color:
                        comparison.delta > 0
                          ? "#dc2626"
                          : comparison.delta < 0
                            ? "#16a34a"
                            : "#6b7280",
                    }}
                  >
                    {comparison.delta > 0 ? "+" : ""}
                    {usd(comparison.delta)}
                    {comparison.deltaPercent != null &&
                      ` (${comparison.deltaPercent > 0 ? "+" : ""}${comparison.deltaPercent.toFixed(1)}%)`}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>
                No CostBook match found for this product.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility styles
// ---------------------------------------------------------------------------

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: disabled ? "#f3f4f6" : "#fff",
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "#9ca3af" : "#374151",
  };
}
