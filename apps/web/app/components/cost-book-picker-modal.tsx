"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "../hooks/use-draggable";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type CostBookItem = {
  id: string;
  lineNo?: number | null;
  cat?: string | null;
  sel?: string | null;
  description?: string | null;
  unit?: string | null;
  unitPrice?: number | null;
  lastKnownUnitPrice?: number | null;
  activity?: string | null;
  groupCode?: string | null;
  groupDescription?: string | null;
  divisionCode?: string | null;
  divisionName?: string | null;
};

export type CostBookSelection = {
  item: CostBookItem;
  qty: number;
};

type CostBookPickerModalProps = {
  title?: string;
  subtitle?: string;
  noteText?: string;
  initialCats?: string[];
  initialSel?: string;
  initialActivity?: string;
  initialQuery?: string;
  defaultQty?: number;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: (selection: CostBookSelection[]) => void | Promise<void>;
  onClose: () => void;
  autoFocusDescription?: boolean;
};

// ---------------------------------------------------------------------------
// Column sorting helpers
// ---------------------------------------------------------------------------
type SortKey = "cat" | "sel" | "activity" | "divisionCode" | "description" | "unit" | "unitPrice";
type SortDir = "asc" | "desc";

function comparePrimitive(a: any, b: any, dir: SortDir): number {
  const aVal = a == null ? "" : a;
  const bVal = b == null ? "" : b;
  if (typeof aVal === "number" && typeof bVal === "number") {
    return dir === "asc" ? aVal - bVal : bVal - aVal;
  }
  const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

// ---------------------------------------------------------------------------
// Search history suggestion type
// ---------------------------------------------------------------------------
type HistoryItem = { field: string; term: string; hitCount: number };

export function CostBookPickerModal({
  title = "Tenant Cost Book",
  subtitle,
  noteText,
  initialCats,
  initialSel,
  initialActivity,
  initialQuery,
  defaultQty,
  confirmLabel = "Use selected",
  confirmDisabled,
  onConfirm,
  onClose,
  autoFocusDescription,
}: CostBookPickerModalProps) {
  const [cats, setCats] = useState<string[]>([]);
  const [catsError, setCatsError] = useState<string | null>(null);

  const [activities, setActivities] = useState<string[]>([]);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const [catFilterQuery, setCatFilterQuery] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>(() => initialCats ?? []);
  const [catPanelWidth, setCatPanelWidth] = useState(180);
  const catPanelResizing = useRef(false);

  const [sel, setSel] = useState<string>(initialSel ?? "");
  const [activity, setActivity] = useState<string>(initialActivity ?? "");
  const [query, setQuery] = useState<string>(initialQuery ?? "");

  const [results, setResults] = useState<CostBookItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  // Search history suggestions
  const [searchHistory, setSearchHistory] = useState<HistoryItem[]>([]);

  // Column sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const descriptionInputRef = useRef<HTMLInputElement | null>(null);
  const draggable = useDraggable();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  const filteredCats = useMemo(() => {
    const q = catFilterQuery.trim().toUpperCase();
    if (!q) return cats;
    return cats.filter((c) => c.toUpperCase().includes(q));
  }, [cats, catFilterQuery]);

  const selectedCount = selectedIds.size;

  // Sorted results
  const sortedResults = useMemo(() => {
    if (!sortKey) return results;
    return [...results].sort((a: any, b: any) => comparePrimitive(a[sortKey], b[sortKey], sortDir));
  }, [results, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir("asc");
        return key;
      }
      if (sortDir === "asc") {
        setSortDir("desc");
        return key;
      }
      // desc → clear
      setSortDir("asc");
      return null;
    });
  }, [sortDir]);

  // History suggestions per field
  const historySel = useMemo(() => searchHistory.filter((h) => h.field === "SEL"), [searchHistory]);
  const historyDesc = useMemo(() => searchHistory.filter((h) => h.field === "DESCRIPTION"), [searchHistory]);
  const historyActivity = useMemo(() => searchHistory.filter((h) => h.field === "ACTIVITY"), [searchHistory]);

  // Load CATs, Activities, and Search History on mount
  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setCatsError("Missing access token; please log in again.");
      setActivitiesError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    (async () => {
      setCatsError(null);
      try {
        const res = await fetch(`${API_BASE}/pricing/company-price-list/cats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load CAT list (${res.status}) ${text}`);
        }
        const json: any = await res.json().catch(() => null);
        const nextCats = Array.isArray(json?.cats) ? json.cats : [];
        if (cancelled) return;
        setCats(nextCats.map((c: any) => String(c ?? "").trim()).filter(Boolean));
      } catch (err: any) {
        if (!cancelled) setCatsError(err?.message ?? "Failed to load CAT list");
      }
    })();

    (async () => {
      setActivitiesError(null);
      try {
        const res = await fetch(`${API_BASE}/pricing/company-price-list/activities`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load Activity list (${res.status}) ${text}`);
        }
        const json: any = await res.json().catch(() => null);
        const nextActs = Array.isArray(json?.activities) ? json.activities : [];
        if (cancelled) return;
        setActivities(nextActs.map((a: any) => String(a ?? "").trim()).filter(Boolean));
      } catch (err: any) {
        if (!cancelled) setActivitiesError(err?.message ?? "Failed to load Activity list");
      }
    })();

    // Load search history
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/pricing/company-price-list/search-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json: any = await res.json().catch(() => null);
        if (cancelled) return;
        if (Array.isArray(json?.items)) setSearchHistory(json.items);
      } catch {
        // Non-critical — silently ignore
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Handle CAT panel resize via mouse drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!catPanelResizing.current) return;
      setCatPanelWidth(Math.max(120, Math.min(400, e.clientX - 16)));
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

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return Array.from(next).sort();
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const fallbackQty =
          typeof defaultQty === "number" && Number.isFinite(defaultQty) && defaultQty > 0
            ? defaultQty
            : 1;
        setQtyById((qPrev) => ({ ...qPrev, [id]: qPrev[id] ?? String(fallbackQty) }));
      }
      return next;
    });
  };

  // --- Core search function (stable via useCallback) ---
  const selRef = useRef(sel);
  const activityRef = useRef(activity);
  const queryRef = useRef(query);
  const selectedCatsRef = useRef(selectedCats);
  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { activityRef.current = activity; }, [activity]);
  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => { selectedCatsRef.current = selectedCats; }, [selectedCats]);

  const runSearch = useCallback(async () => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setSearchError("Missing access token; please log in again.");
      return;
    }

    const _sel = selRef.current;
    const _activity = activityRef.current;
    const _query = queryRef.current;
    const _selectedCats = selectedCatsRef.current;

    setSearching(true);
    setSearchError(null);

    try {
      const limit =
        _selectedCats.length > 0 && !_query.trim() && !_sel.trim() && !_activity.trim()
          ? 2000
          : _selectedCats.length > 0 || !!_activity.trim()
            ? 500
            : 200;

      const body: any = {
        query: _query.trim(),
        cats: _selectedCats.length > 0 ? _selectedCats : undefined,
        sel: _sel.trim() || undefined,
        activity: _activity.trim() || undefined,
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
        throw new Error(`Search failed (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      const items = Array.isArray(json?.items)
        ? json.items.map((raw: any) => ({
            ...raw,
            divisionCode: raw.division?.code ?? raw.divisionCode ?? null,
            divisionName: raw.division?.name ?? raw.divisionName ?? null,
          }))
        : [];
      setResults(items);
    } catch (err: any) {
      setSearchError(err?.message ?? "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Initial auto-load
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    void runSearch();
  }, [runSearch]);

  // Debounced auto-search on text input changes (400ms).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void runSearch(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [sel, activity, query, runSearch]);

  // CAT selection changes → immediate search (no debounce).
  const prevCatsRef = useRef(selectedCats);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (prevCatsRef.current === selectedCats) return;
    prevCatsRef.current = selectedCats;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch();
  }, [selectedCats, runSearch]);

  useEffect(() => {
    if (!autoFocusDescription) return;
    const el = descriptionInputRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.select === "function") el.select();
  }, [autoFocusDescription]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void runSearch();
    }
  };

  const confirm = async () => {
    if (!onConfirm) { onClose(); return; }
    const selection: CostBookSelection[] = sortedResults
      .filter((r) => selectedIds.has(r.id))
      .map((r) => {
        const qtyRaw = qtyById[r.id] ?? "1";
        const qty = Number(qtyRaw);
        return { item: r, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 };
      });
    await onConfirm(selection);
  };

  // Sort arrow indicator
  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return <span style={{ opacity: 0.3, marginLeft: 4 }}>⇅</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const thStyle = (align: "left" | "right", width?: number): React.CSSProperties => ({
    textAlign: align,
    padding: "8px 10px",
    width: width ?? undefined,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(1200px, 98vw)", height: "92vh", maxHeight: "92vh", overflow: "hidden",
          background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb",
          boxShadow: "0 12px 32px rgba(15,23,42,0.25)",
          display: "flex", flexDirection: "column",
          ...draggable.style,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          {...draggable.handleProps}
          style={{
            padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            borderRadius: "12px 12px 0 0", ...draggable.handleProps.style,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              {subtitle ?? "Search and select tenant cost book line items."}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {noteText && noteText.trim() && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", textAlign: "right", maxWidth: 400 }}>
                Hint Note carried forward - {noteText}
              </div>
            )}
            <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1 }} aria-label="Close cost book modal">×</button>
          </div>
        </div>

        {/* Main content area: CAT sidebar + results */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* CAT Filter Sidebar */}
          <div style={{ width: catPanelWidth, minWidth: 120, maxWidth: 400, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#f9fafb", flexShrink: 0 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                CAT Filter
                <span style={{ marginLeft: 6, fontWeight: 400, color: "#9ca3af" }}>({filteredCats.length})</span>
              </div>
              <input
                value={catFilterQuery} onChange={(e) => setCatFilterQuery(e.target.value)}
                placeholder="Search CATs…"
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 11 }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" onClick={() => setSelectedCats([])} style={{ flex: 1, padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer", fontSize: 10 }}>Clear</button>
                <button type="button" onClick={() => setSelectedCats([...filteredCats])} style={{ flex: 1, padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer", fontSize: 10 }}>All</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
              {filteredCats.length === 0 ? (
                <div style={{ padding: "12px 10px", fontSize: 11, color: "#6b7280" }}>No CATs match.</div>
              ) : (
                filteredCats.map((cat) => {
                  const checked = selectedCats.includes(cat);
                  return (
                    <label key={cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", background: checked ? "#dbeafe" : "transparent", borderLeft: checked ? "3px solid #2563eb" : "3px solid transparent", fontSize: 12 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCat(cat)} style={{ accentColor: "#2563eb" }} />
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: checked ? 600 : 400 }}>{cat}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#6b7280" }}>
              {selectedCats.length > 0 ? `${selectedCats.length} selected` : "All CATs"}
            </div>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={() => { catPanelResizing.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            style={{ width: 6, cursor: "col-resize", background: "#e5e7eb", flexShrink: 0 }}
            title="Drag to resize CAT panel"
          />

          {/* Right side: filters + results */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 12, gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 200px 1fr 140px", gap: 8, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>SEL</div>
                <input value={sel} onChange={(e) => setSel(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="(any)" list="costbook-picker-sel-history" style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }} />
                <datalist id="costbook-picker-sel-history">
                  {historySel.map((h) => (<option key={h.term} value={h.term} label={`${h.term} (${h.hitCount})`} />))}
                </datalist>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Activity</div>
                <input value={activity} onChange={(e) => setActivity(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="(any)" list="costbook-picker-activity-options" style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }} />
                <datalist id="costbook-picker-activity-options">
                  {historyActivity.map((h) => (<option key={`hist-${h.term}`} value={h.term} label={`${h.term} (${h.hitCount})`} />))}
                  {activities.slice(0, 500).map((a) => (<option key={a} value={a} />))}
                </datalist>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Description</div>
                <input ref={descriptionInputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search description" list="costbook-picker-desc-history" style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: autoFocusDescription ? "1px solid #2563eb" : "1px solid #d1d5db", background: autoFocusDescription ? "#eff6ff" : "#ffffff", fontSize: 12 }} />
                <datalist id="costbook-picker-desc-history">
                  {historyDesc.map((h) => (<option key={h.term} value={h.term} label={`${h.term} (${h.hitCount})`} />))}
                </datalist>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); void runSearch(); }} disabled={searching} style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#ffffff", cursor: searching ? "default" : "pointer", fontSize: 12, opacity: searching ? 0.7 : 1 }}>
                  {searching ? "Searching..." : "Search"}
                </button>
                <button type="button" onClick={() => { setSelectedCats([]); setCatFilterQuery(""); setSel(""); setActivity(""); setQuery(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#ffffff", cursor: "pointer", fontSize: 12 }}>
                  Reset
                </button>
              </div>
            </div>

            {catsError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{catsError}</div>}
            {activitiesError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{activitiesError}</div>}
            {searchError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{searchError}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, color: "#4b5563" }}>
              <div>
                Results: <strong>{results.length}</strong>
                {searching && <span style={{ marginLeft: 8, color: "#2563eb" }}>⟳ searching…</span>}
                {selectedCount > 0 ? <>{" "}· Selected: <strong>{selectedCount}</strong></> : null}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setSelectedIds(new Set()); setQtyById({}); }} disabled={selectedCount === 0} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#ffffff", cursor: selectedCount === 0 ? "default" : "pointer", fontSize: 12, opacity: selectedCount === 0 ? 0.6 : 1 }}>Clear selection</button>
                {onConfirm && (
                  <button type="button" onClick={() => void confirm()} disabled={!!confirmDisabled || selectedCount === 0} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0f172a", background: confirmDisabled || selectedCount === 0 ? "#e5e7eb" : "#0f172a", color: confirmDisabled || selectedCount === 0 ? "#4b5563" : "#f9fafb", cursor: confirmDisabled || selectedCount === 0 ? "default" : "pointer", fontSize: 12 }}>
                    {confirmLabel}
                  </button>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto", flex: 1, minHeight: 360, paddingRight: 18, paddingBottom: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px", width: 36 }}></th>
                    <th style={thStyle("left", 70)} onClick={() => toggleSort("cat")}>CAT{sortArrow("cat")}</th>
                    <th style={thStyle("left", 70)} onClick={() => toggleSort("sel")}>SEL{sortArrow("sel")}</th>
                    <th style={thStyle("left", 140)} onClick={() => toggleSort("activity")}>Activity{sortArrow("activity")}</th>
                    <th style={thStyle("left", 60)} onClick={() => toggleSort("divisionCode")}>Div{sortArrow("divisionCode")}</th>
                    <th style={thStyle("left")} onClick={() => toggleSort("description")}>Description{sortArrow("description")}</th>
                    <th style={thStyle("left", 70)} onClick={() => toggleSort("unit")}>Unit{sortArrow("unit")}</th>
                    <th style={thStyle("right", 110)} onClick={() => toggleSort("unitPrice")}>Unit ${sortArrow("unitPrice")}</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", width: 90 }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((row) => {
                    const checked = selectedIds.has(row.id);
                    const unitPrice = typeof row.unitPrice === "number" ? row.unitPrice : null;
                    const qtyStr = qtyById[row.id] ?? "1";
                    return (
                      <tr key={row.id} style={{ background: checked ? "#eff6ff" : "transparent" }} onDoubleClick={() => toggleRow(row.id)}>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", whiteSpace: "nowrap" }}>{String(row.cat ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", whiteSpace: "nowrap" }}>{String(row.sel ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", color: "#6b7280", whiteSpace: "nowrap" }}>{String(row.activity ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", color: "#059669", fontWeight: 600, whiteSpace: "nowrap", fontSize: 11 }} title={row.divisionName ?? ""}>{String(row.divisionCode ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>{String(row.description ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", color: "#6b7280" }}>{String(row.unit ?? "").trim()}</td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {unitPrice != null ? `$${unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {checked ? (
                            <input value={qtyStr} onChange={(e) => setQtyById((prev) => ({ ...prev, [row.id]: e.target.value }))} onFocus={(e) => e.target.select()} onClick={(e) => { const input = e.currentTarget; if (input.selectionStart === input.selectionEnd) input.select(); }} style={{ width: 70, padding: "4px 6px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12, textAlign: "right" }} />
                          ) : (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
