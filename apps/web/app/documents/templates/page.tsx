"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type DocTemplateType = "INVOICE" | "QUOTE" | "SOP" | "GENERIC";

interface DocTemplateRow {
  id: string;
  companyId: string;
  type: DocTemplateType;
  code: string;
  label: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion?: { id: string; versionNo: number; createdAt: string; label?: string | null } | null;
  _count?: { versions: number };
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

type DocStatus = "Published" | "Unpublished";
function getStatus(t: DocTemplateRow): DocStatus { return t.active ? "Published" : "Unpublished"; }

const STATUS_STYLES: Record<DocStatus, { bg: string; color: string; border: string }> = {
  Published:   { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
  Unpublished: { bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
};

function StatusBadge({ status }: { status: DocStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", fontSize: 11, fontWeight: 600, borderRadius: 9999, backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

const TYPE_COLORS: Record<string, string> = { SOP: "#7c3aed", INVOICE: "#0369a1", QUOTE: "#b45309", GENERIC: "#6b7280" };
function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? "#6b7280";
  return <span style={{ display: "inline-block", padding: "2px 6px", fontSize: 10, fontWeight: 700, borderRadius: 4, backgroundColor: `${c}14`, color: c, letterSpacing: "0.04em" }}>{type}</span>;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "—"; }
}

// ---------------------------------------------------------------------------
// Search Results Modal
// ---------------------------------------------------------------------------

function SearchResultsModal({ results, query, onClose }: { results: DocTemplateRow[]; query: string; onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Modal header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {results.length} result{results.length !== 1 ? "s" : ""} for “{query}”
          </span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}>×</button>
        </div>

        {/* Results list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No documents match your search.</div>
          ) : (
            results.map((t) => (
              <Link
                key={t.id}
                href={`/documents/templates/${t.id}`}
                onClick={onClose}
                style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f3f4f6", textDecoration: "none", color: "#111827", transition: "background 0.1s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.code}{t.description ? ` — ${t.description}` : ""}
                  </div>
                </div>
                <TypeBadge type={t.type} />
                <StatusBadge status={getStatus(t)} />
                <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  v{t.currentVersion?.versionNo ?? "?"}
                  {(t._count?.versions ?? 0) > 1 && <span style={{ marginLeft: 2, fontSize: 10 }}>({t._count!.versions})</span>}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DocumentTemplatesPage() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  const isUnpublishedSopsFilter = filterParam === "unpublished-sops";

  const [templates, setTemplates] = useState<DocTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myRole, setMyRole] = useState<string | null>(null);
  const canEdit = myRole === "OWNER" || myRole === "ADMIN";

  // Search state
  const [search, setSearch] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);

  // New template form
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<DocTemplateType>("INVOICE");
  const [newCode, setNewCode] = useState("INVOICE");
  const [newLabel, setNewLabel] = useState("Invoice Template");
  const [newDesc, setNewDesc] = useState("Client invoice template");
  const [newHtml, setNewHtml] = useState<string>(
    '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8" />\n  <title>Invoice</title>\n</head>\n<body>\n  <h1>Invoice</h1>\n  <p>Replace this with your template HTML.</p>\n</body>\n</html>\n',
  );
  const [newError, setNewError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadRole = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const meRes = await fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!meRes.ok) return;
      const me: any = await meRes.json();
      const companyId = typeof window !== "undefined" ? localStorage.getItem("companyId") : null;
      const membership = (me?.memberships ?? []).find((m: any) => String(m.companyId) === String(companyId));
      if (membership?.role) setMyRole(String(membership.role));
    } catch { /* ignore */ }
  };

  const load = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) { setError("Missing access token; please log in again."); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/documents/templates`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(`Failed to load templates (${res.status}) ${text}`); }
      const json = await res.json();
      setTemplates(Array.isArray(json) ? json : []);
    } catch (e: any) { setError(e?.message ?? "Failed to load templates"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadRole(); void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showNew) return;
    if (newType === "INVOICE") { setNewCode("INVOICE"); setNewLabel("Invoice Template"); setNewDesc("Client invoice template"); }
    else if (newType === "QUOTE") { setNewCode("QUOTE"); setNewLabel("Quotation Template"); setNewDesc("Client quotation template"); }
    else if (newType === "SOP") { setNewCode("SOP"); setNewLabel("SOP Template"); setNewDesc("Standard Operating Procedure (internal) template"); }
  }, [newType, showNew]);

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return templates.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [templates, search]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && search.trim()) {
      setShowSearchModal(true);
    }
    if (e.key === "Escape") {
      setSearch("");
      setShowSearchModal(false);
    }
  };

  // -----------------------------------------------------------------------
  // Grouped card data
  // -----------------------------------------------------------------------

  const displayTemplates = useMemo(() => {
    if (isUnpublishedSopsFilter) return templates.filter((t) => t.type === "SOP" && !t.active);
    return templates;
  }, [templates, isUnpublishedSopsFilter]);

  const grouped = useMemo(() => {
    const byType = new Map<string, DocTemplateRow[]>();
    for (const t of displayTemplates) {
      const key = String(t.type || "GENERIC");
      const bucket = byType.get(key) ?? [];
      bucket.push(t);
      byType.set(key, bucket);
    }
    const order: DocTemplateType[] = ["INVOICE", "QUOTE", "SOP", "GENERIC"];
    return order
      .filter((k) => (byType.get(k) ?? []).length > 0)
      .map((k) => ({ type: k, items: (byType.get(k) ?? []).sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [displayTemplates]);

  // -----------------------------------------------------------------------
  // Create template
  // -----------------------------------------------------------------------

  const createTemplate = async () => {
    if (!canEdit) { setNewError("Only Admin/Owner can create templates."); return; }
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;
    setNewError(null);
    if (!newCode.trim() || !newLabel.trim()) { setNewError("Type, code and label are required."); return; }
    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/documents/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: newType, code: newCode.trim(), label: newLabel.trim(), description: newDesc.trim(), templateHtml: newHtml, versionLabel: "v1", versionNotes: "Initial template" }),
      });
      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(`Create failed (${res.status}) ${text}`); }
      setShowNew(false);
      await load();
    } catch (e: any) { setNewError(e?.message ?? "Create failed"); }
    finally { setCreating(false); }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Documents — Templates</h2>
            <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
              Company-scoped document templates with version history. Print any template to PDF.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={load} disabled={loading}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, cursor: loading ? "default" : "pointer", height: 36 }}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={() => { setNewError(null); setShowNew(true); }} disabled={!canEdit}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #0f172a", background: canEdit ? "#0f172a" : "#e5e7eb", color: canEdit ? "#f9fafb" : "#4b5563", fontSize: 12, cursor: canEdit ? "pointer" : "default", height: 36 }}>
              New template
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9ca3af", pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            placeholder="Search all documents by name, code, or description…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value.trim()) setShowSearchModal(true);
              else setShowSearchModal(false);
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (search.trim()) setShowSearchModal(true); }}
            style={{ width: "100%", padding: "10px 12px 10px 34px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, outline: "none" }}
          />
        </div>

        {/* Unpublished SOPs deep-link banner */}
        {isUnpublishedSopsFilter && (
          <div style={{ padding: "8px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
            <span>📑 Showing <strong>unpublished SOPs</strong> only ({displayTemplates.length} of {templates.length} templates)</span>
            <Link href="/documents/templates" style={{ color: "#2563eb", textDecoration: "none", fontSize: 12, fontWeight: 500 }}>Show all</Link>
          </div>
        )}

        {error && <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>}

        {/* New template form */}
        {showNew && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: "0 0 160px" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Type</div>
                <select value={newType} onChange={(e) => setNewType(e.target.value as DocTemplateType)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}>
                  <option value="INVOICE">Invoice</option><option value="QUOTE">Quote</option><option value="SOP">SOP</option><option value="GENERIC">Generic</option>
                </select>
              </label>
              <label style={{ flex: "1 1 180px" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Code</div>
                <input value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }} />
              </label>
              <label style={{ flex: "2 1 260px" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Label</div>
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }} />
              </label>
            </div>
            <label style={{ display: "block", marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Description</div>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ display: "block", marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Initial HTML (v1)</div>
              <textarea value={newHtml} onChange={(e) => setNewHtml(e.target.value)}
                style={{ width: "100%", minHeight: 160, padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }} />
            </label>
            {newError && <div style={{ marginTop: 8, color: "#b91c1c" }}>{newError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button type="button" onClick={() => setShowNew(false)} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>Cancel</button>
              <button type="button" disabled={creating} onClick={createTemplate}
                style={{ padding: "8px 10px", borderRadius: 6, border: "none", background: creating ? "#e5e7eb" : "#2563eb", color: creating ? "#4b5563" : "#f9fafb", cursor: creating ? "default" : "pointer" }}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Type-grouped cards */}
        <div style={{ marginTop: 4 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
          ) : error ? null : displayTemplates.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              {isUnpublishedSopsFilter ? "No unpublished SOPs found." : "No templates yet."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {grouped.map((g) => (
                <div key={g.type} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "#f3f4f6", padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <TypeBadge type={g.type} />
                    <span>{g.type}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>({g.items.length})</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ textAlign: "left", padding: "10px 12px" }}>Template</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 100 }}>Status</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 80 }}>Version</th>
                        <th style={{ textAlign: "left", padding: "10px 12px", width: 100 }}>Updated</th>
                        <th style={{ textAlign: "right", padding: "10px 12px", width: 60 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((t) => (
                        <tr key={t.id}>
                          <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                            <div style={{ fontWeight: 600 }}>{t.label}</div>
                            <div style={{ color: "#6b7280", fontSize: 11 }}>{t.code}</div>
                            {t.description && <div style={{ marginTop: 2, fontSize: 11, color: "#9ca3af" }}>{t.description}</div>}
                          </td>
                          <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            <StatusBadge status={getStatus(t)} />
                          </td>
                          <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            {t.currentVersion ? (
                              <span title={`${t._count?.versions ?? 0} revision(s)`}>
                                v{t.currentVersion.versionNo}
                                {(t._count?.versions ?? 0) > 1 && <span style={{ color: "#9ca3af", fontSize: 10, marginLeft: 3 }}>({t._count!.versions})</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", verticalAlign: "top", fontSize: 11, color: "#9ca3af" }}>
                            {formatDate(t.updatedAt)}
                          </td>
                          <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right", verticalAlign: "top" }}>
                            <Link href={`/documents/templates/${t.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>Open</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: "#6b7280" }}>
          Permissions: Admin/Owner can create & edit templates. Everyone else can view.
        </div>
      </div>

      {/* Search results modal */}
      {showSearchModal && search.trim() && (
        <SearchResultsModal
          results={searchResults}
          query={search.trim()}
          onClose={() => { setShowSearchModal(false); setSearch(""); }}
        />
      )}
    </PageCard>
  );
}
