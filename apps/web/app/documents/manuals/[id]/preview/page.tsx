"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ManualInfo {
  id: string;
  title: string;
  currentVersion: number;
  status: string;
}

interface TocEntry {
  id: string;
  type: "chapter" | "document";
  title: string;
  level: number;
  anchor: string;
  revisionNo?: number;
  includeInPrint?: boolean;
  children?: TocEntry[];
}

interface ManualView {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  mapping: ViewMapping;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
}

interface ViewMapping {
  compactSingleDocChapters?: boolean;
  documentMoves?: { manualDocumentId: string; toChapterId: string; sortOrder?: number }[];
  chapterOrder?: string[];
  hiddenChapterIds?: string[];
  hiddenDocumentIds?: string[];
  chapterMerges?: { targetChapterId: string; sourceChapterIds: string[] }[];
}

export default function TenantManualPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: manualId } = React.use(params);
  const router = useRouter();

  const [manualInfo, setManualInfo] = useState<ManualInfo | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [showTocPanel, setShowTocPanel] = useState(false);

  // Options
  const [includeToc, setIncludeToc] = useState(true);
  const [includeCover, setIncludeCover] = useState(true);
  const [includeRevisions, setIncludeRevisions] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  // Views
  const [views, setViews] = useState<ManualView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [creatingView, setCreatingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showViewEditor, setShowViewEditor] = useState(false);
  const [editMapping, setEditMapping] = useState<ViewMapping>({});

  // Check admin role for view management
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const role = localStorage.getItem("companyRole");
    setIsAdmin(role === "OWNER" || role === "ADMIN");
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  const loadManualInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load manual");
      const data = await res.json();
      setManualInfo({
        id: data.id,
        title: data.title,
        currentVersion: data.currentVersion,
        status: data.status,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load manual");
    }
  }, [manualId]);

  const loadToc = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/toc`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setToc(data);
      }
    } catch {
      // Ignore TOC load errors
    }
  }, [manualId]);

  const loadViews = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/views`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: ManualView[] = await res.json();
        setViews(data);
        // Auto-select default view on first load
        const def = data.find((v) => v.isDefault);
        if (def && !selectedViewId) {
          setSelectedViewId(def.id);
          setEditMapping(def.mapping || {});
          if (def.mapping?.compactSingleDocChapters !== undefined) {
            setCompactMode(def.mapping.compactSingleDocChapters);
          }
        }
      }
    } catch {
      // Ignore
    }
  }, [manualId, selectedViewId]);

  const handleCreateView = async () => {
    if (!newViewName.trim()) return;
    setCreatingView(true);
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/views`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: newViewName.trim(), mapping: {} }),
      });
      if (res.ok) {
        const view = await res.json();
        setViews((prev) => [...prev, view]);
        setSelectedViewId(view.id);
        setEditMapping(view.mapping || {});
        setNewViewName("");
        setShowViewEditor(true);
      }
    } catch {
      // Ignore
    } finally {
      setCreatingView(false);
    }
  };

  const handleSaveView = async () => {
    if (!selectedViewId) return;
    setSavingView(true);
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/views/${selectedViewId}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: editMapping }),
      });
      if (res.ok) {
        const updated = await res.json();
        setViews((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      }
    } catch {
      // Ignore
    } finally {
      setSavingView(false);
    }
  };

  const handleDeleteView = async (viewId: string) => {
    if (!confirm("Delete this view?")) return;
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/views/${viewId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setViews((prev) => prev.filter((v) => v.id !== viewId));
        if (selectedViewId === viewId) {
          setSelectedViewId(null);
          setShowViewEditor(false);
          setEditMapping({});
        }
      }
    } catch {
      // Ignore
    }
  };

  const selectView = (viewId: string | null) => {
    setSelectedViewId(viewId);
    setShowViewDropdown(false);
    if (viewId) {
      const view = views.find((v) => v.id === viewId);
      if (view) {
        setEditMapping(view.mapping || {});
        if (view.mapping?.compactSingleDocChapters !== undefined) {
          setCompactMode(view.mapping.compactSingleDocChapters);
        }
      }
    } else {
      setEditMapping({});
      setShowViewEditor(false);
    }
  };

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (!includeToc) queryParams.set("toc", "false");
      if (!includeCover) queryParams.set("cover", "false");
      if (!includeRevisions) queryParams.set("revisions", "false");
      if (compactMode) queryParams.set("compact", "true");
      if (selectedViewId) queryParams.set("viewId", selectedViewId);
      queryParams.set("baseUrl", window.location.origin);

      const res = await fetch(
        `${API_BASE}/manuals/${manualId}/render?${queryParams.toString()}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) throw new Error("Failed to render manual");
      const html = await res.text();
      setHtmlContent(html);
    } catch (err: any) {
      setError(err?.message || "Failed to render manual");
    } finally {
      setLoading(false);
    }
  }, [manualId, includeToc, includeCover, includeRevisions, compactMode, selectedViewId]);

  useEffect(() => {
    loadManualInfo();
    loadToc();
    loadViews();
    loadPreview();
  }, [loadManualInfo, loadToc, loadViews, loadPreview]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const pdfParams = new URLSearchParams();
      if (compactMode) pdfParams.set("compact", "true");
      if (selectedViewId) pdfParams.set("viewId", selectedViewId);
      const pdfQuery = pdfParams.toString();
      const res = await fetch(
        `${API_BASE}/manuals/${manualId}/pdf${pdfQuery ? `?${pdfQuery}` : ""}`,
        { headers: getAuthHeaders() }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate PDF");
      }

      const disposition = res.headers.get("Content-Disposition");
      let filename = "manual.pdf";
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow && htmlContent) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: "#b91c1c" }}>Error</h1>
        <p style={{ color: "#6b7280" }}>{error}</p>
        <button
          onClick={() => router.push("/documents/manuals")}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Back to Manuals
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1f2937" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          background: "#111827",
          borderBottom: "1px solid #374151",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => router.push(`/documents/manuals`)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              background: "#374151",
              color: "#d1d5db",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
          <div style={{ width: 1, height: 24, backgroundColor: "#374151" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 16, color: "#ffffff" }}>
              {manualInfo?.title || "Loading..."}
            </h1>
            {manualInfo && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                Version {manualInfo.currentVersion} • {manualInfo.status}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Options */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginRight: 8 }}>
            {/* Views dropdown */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowViewDropdown(!showViewDropdown)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 13,
                  backgroundColor: selectedViewId ? "#1d4ed8" : "#374151",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14 }}>👁</span>
                {selectedViewId
                  ? views.find((v) => v.id === selectedViewId)?.name || "View"
                  : "Standard"}
                <span style={{ fontSize: 10, marginLeft: 2 }}>▼</span>
              </button>
              {showViewDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 4,
                    width: 240,
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    zIndex: 100,
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => selectView(null)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      color: !selectedViewId ? "#60a5fa" : "#e5e7eb",
                      backgroundColor: "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: !selectedViewId ? 600 : 400,
                    }}
                  >
                    Standard (no view)
                  </button>
                  {views.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 4px 0 0",
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectView(v.id)}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: 12,
                          color: selectedViewId === v.id ? "#60a5fa" : "#e5e7eb",
                          backgroundColor: "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontWeight: selectedViewId === v.id ? 600 : 400,
                        }}
                      >
                        {v.isDefault && <span style={{ color: "#fbbf24", marginRight: 4 }}>★</span>}
                        {v.name}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              const makeDefault = !v.isDefault;
                              const res = await fetch(`${API_BASE}/manuals/${manualId}/views/${v.id}`, {
                                method: "PUT",
                                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({ isDefault: makeDefault }),
                              });
                              if (res.ok) {
                                const updated = await res.json();
                                setViews((prev) => prev.map((x) => ({ ...x, isDefault: x.id === updated.id ? updated.isDefault : false })));
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: 14,
                              color: v.isDefault ? "#fbbf24" : "#9ca3af",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                            title={v.isDefault ? "Unstar (unset default)" : "Star as default"}
                          >
                            {v.isDefault ? "★" : "☆"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteView(v.id)}
                            style={{
                              padding: "2px 6px",
                              fontSize: 11,
                              color: "#ef4444",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                            title="Delete view"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {isAdmin && (
                    <div style={{ borderTop: "1px solid #374151", padding: "8px 12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="text"
                          value={newViewName}
                          onChange={(e) => setNewViewName(e.target.value)}
                          placeholder="New view name…"
                          style={{
                            flex: 1,
                            padding: "4px 8px",
                            fontSize: 12,
                            borderRadius: 4,
                            border: "1px solid #4b5563",
                            backgroundColor: "#111827",
                            color: "#e5e7eb",
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleCreateView()}
                        />
                        <button
                          type="button"
                          onClick={handleCreateView}
                          disabled={creatingView || !newViewName.trim()}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 500,
                            borderRadius: 4,
                            border: "none",
                            backgroundColor: "#2563eb",
                            color: "#fff",
                            cursor: creatingView ? "wait" : "pointer",
                            opacity: !newViewName.trim() ? 0.5 : 1,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {isAdmin && selectedViewId && (
              <button
                type="button"
                onClick={() => setShowViewEditor(!showViewEditor)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 13,
                  backgroundColor: showViewEditor ? "#4b5563" : "#374151",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✏️ Edit View
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowTocPanel(!showTocPanel)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                backgroundColor: showTocPanel ? "#4b5563" : "#374151",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14 }}>📑</span> Sections
            </button>
            <div style={{ width: 1, height: 20, backgroundColor: "#4b5563" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => setIncludeCover(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              Cover
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeToc}
                onChange={(e) => setIncludeToc(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              TOC
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeRevisions}
                onChange={(e) => setIncludeRevisions(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              Revisions
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              Compact
            </label>
          </div>

          <button
            onClick={handlePrint}
            disabled={loading || !htmlContent}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#374151",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            🖨️ Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={loading || downloading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: loading || downloading ? "not-allowed" : "pointer",
              opacity: loading || downloading ? 0.7 : 1,
            }}
          >
            {downloading ? "Generating..." : "📥 Download PDF"}
          </button>
        </div>
      </div>

      {/* Main content area with optional panels */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* View Editor Panel (admin only) */}
        {showViewEditor && selectedViewId && isAdmin && (
          <div
            style={{
              width: 320,
              backgroundColor: "#1f2937",
              borderRight: "1px solid #374151",
              overflow: "auto",
              padding: 16,
              flexShrink: 0,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ffffff" }}>
                Edit: {views.find((v) => v.id === selectedViewId)?.name}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
                Configure how sections appear in this view
              </p>
            </div>

            {/* Compact toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: "#e5e7eb", fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editMapping.compactSingleDocChapters ?? false}
                onChange={(e) => setEditMapping((m) => ({ ...m, compactSingleDocChapters: e.target.checked }))}
                style={{ accentColor: "#3b82f6" }}
              />
              Compact single-doc sections
            </label>

            <div style={{ borderTop: "1px solid #374151", marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>Hide chapters / documents</div>
              {toc.map((entry) => (
                <ViewEditorEntry
                  key={entry.id}
                  entry={entry}
                  mapping={editMapping}
                  onToggleChapterHidden={(chId) => {
                    setEditMapping((m) => {
                      const hidden = new Set(m.hiddenChapterIds || []);
                      if (hidden.has(chId)) hidden.delete(chId);
                      else hidden.add(chId);
                      return { ...m, hiddenChapterIds: Array.from(hidden) };
                    });
                  }}
                  onToggleDocHidden={(docId) => {
                    setEditMapping((m) => {
                      const hidden = new Set(m.hiddenDocumentIds || []);
                      if (hidden.has(docId)) hidden.delete(docId);
                      else hidden.add(docId);
                      return { ...m, hiddenDocumentIds: Array.from(hidden) };
                    });
                  }}
                />
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleSaveView}
                disabled={savingView}
                style={{
                  flex: 1,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: savingView ? "wait" : "pointer",
                  opacity: savingView ? 0.6 : 1,
                }}
              >
                {savingView ? "Saving…" : "Save View"}
              </button>
            </div>
          </div>
        )}

        {/* TOC Section Panel */}
        {showTocPanel && !showViewEditor && (
          <div
            style={{
              width: 320,
              backgroundColor: "#1f2937",
              borderRight: "1px solid #374151",
              overflow: "auto",
              padding: 16,
              flexShrink: 0,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ffffff" }}>Sections</h3>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
                Document sections in this manual
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {toc.map((entry) => (
                <TocEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Preview iframe/content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", justifyContent: "center", padding: "8px" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: "3px solid #374151",
                  borderTopColor: "#3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <p style={{ marginTop: 12, fontSize: 14 }}>Rendering manual...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : htmlContent ? (
            <div
              style={{
                width: "100%",
                maxWidth: 850,
                height: "100%",
                background: "#ffffff",
                borderRadius: 4,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <iframe
                srcDoc={htmlContent}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                title="Manual Preview"
              />
            </div>
          ) : (
            <div style={{ color: "#9ca3af", textAlign: "center" }}>
              <p>No content to display</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- TOC Entry Row Component (read-only for tenants) ---

function TocEntryRow({ entry }: { entry: TocEntry }) {
  const isDocument = entry.type === "document";

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          backgroundColor: entry.level === 1 ? "#374151" : "#2d3748",
          borderRadius: 4,
          marginLeft: entry.level === 2 ? 16 : 0,
        }}
      >
        <span style={{ width: 16, fontSize: 12 }}>{isDocument ? "📄" : "📁"}</span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: "#e5e7eb",
            fontWeight: entry.level === 1 ? 500 : 400,
          }}
        >
          {entry.title}
        </span>
      </div>
      {entry.children?.map((child) => (
        <TocEntryRow key={child.id} entry={child} />
      ))}
    </>
  );
}

// --- View Editor Entry Component (admin only) ---

function ViewEditorEntry({
  entry,
  mapping,
  onToggleChapterHidden,
  onToggleDocHidden,
}: {
  entry: TocEntry;
  mapping: ViewMapping;
  onToggleChapterHidden: (chapterId: string) => void;
  onToggleDocHidden: (docId: string) => void;
}) {
  const isChapter = entry.type === "chapter";
  const isHidden = isChapter
    ? (mapping.hiddenChapterIds || []).includes(entry.id)
    : (mapping.hiddenDocumentIds || []).includes(entry.id);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 8px",
          backgroundColor: entry.level === 1 ? "#374151" : "#2d3748",
          borderRadius: 4,
          marginLeft: entry.level === 2 ? 16 : 0,
          marginBottom: 3,
          opacity: isHidden ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          onClick={() =>
            isChapter ? onToggleChapterHidden(entry.id) : onToggleDocHidden(entry.id)
          }
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
          title={isHidden ? "Show in view" : "Hide from view"}
        >
          {isHidden ? "🚫" : "👁"}
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: isHidden ? "#6b7280" : "#e5e7eb",
            textDecoration: isHidden ? "line-through" : "none",
            fontWeight: entry.level === 1 ? 500 : 400,
          }}
        >
          {entry.title}
        </span>
        {isHidden && (
          <span style={{ fontSize: 10, color: "#ef4444" }}>Hidden</span>
        )}
      </div>
      {entry.children?.map((child) => (
        <ViewEditorEntry
          key={child.id}
          entry={child}
          mapping={mapping}
          onToggleChapterHidden={onToggleChapterHidden}
          onToggleDocHidden={onToggleDocHidden}
        />
      ))}
    </>
  );
}
