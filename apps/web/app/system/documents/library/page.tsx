"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    versionNo: number;
    createdAt: string;
  } | null;
  _count: {
    publications: number;
    tenantCopies: number;
  };
}

export default function SystemDocumentsLibraryPage() {
  const [documents, setDocuments] = useState<SystemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Create new document form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  // Import HTML modal
  const [showImportHtml, setShowImportHtml] = useState(false);
  const [importHtml, setImportHtml] = useState("");
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [parsedMeta, setParsedMeta] = useState<{
    code?: string;
    title?: string;
    description?: string;
    category?: string;
    // Manual placement
    manualCode?: string;
    manualTitle?: string;
    manualIcon?: string;
    chapterNumber?: string;
    chapterTitle?: string;
  } | null>(null);
  const [importMode, setImportMode] = useState<"document" | "with-manual">("document");

  // Parse NCC metadata from HTML
  const parseHtmlMetadata = (html: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    const getMeta = (name: string) => {
      const el = doc.querySelector(`meta[name="ncc:${name}"]`);
      return el?.getAttribute("content") || undefined;
    };

    const meta = {
      code: getMeta("code"),
      title: getMeta("title"),
      description: getMeta("description"),
      category: getMeta("category"),
      // Manual placement
      manualCode: getMeta("manual-code"),
      manualTitle: getMeta("manual-title"),
      manualIcon: getMeta("manual-icon"),
      chapterNumber: getMeta("chapter-number"),
      chapterTitle: getMeta("chapter-title"),
    };

    // Only set if at least one field was found
    const hasDocMeta = meta.code || meta.title || meta.description || meta.category;
    const hasManualMeta = meta.manualCode || meta.manualTitle;
    
    if (hasDocMeta || hasManualMeta) {
      setParsedMeta(meta);
      // Auto-select mode based on detected metadata
      if (hasManualMeta) {
        setImportMode("with-manual");
      }
    } else {
      setParsedMeta(null);
    }
  };

  // Extract body content only (strip head/html wrapper)
  const extractBodyContent = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.body.innerHTML.trim();
  };

  useEffect(() => {
    loadDocuments();
  }, [showInactive]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const url = `${API_BASE}/system-documents${showInactive ? "?includeInactive=true" : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      setError(err.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newTitle.trim() || !newContent.trim()) return;

    setCreating(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newCode.trim(),
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          category: newCategory.trim() || undefined,
          htmlContent: newContent,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create document");
      }

      // Reset form and reload
      setNewCode("");
      setNewTitle("");
      setNewDescription("");
      setNewCategory("");
      setNewContent("");
      setShowCreateForm(false);
      loadDocuments();
    } catch (err: any) {
      alert(err.message || "Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/system/documents" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
              ← Documents
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: 20 }}>📚 System Documents Library</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button
            onClick={() => setShowImportHtml(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #7c3aed",
              background: "#f5f3ff",
              color: "#7c3aed",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            📋 Import HTML
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: "#2563eb",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + New Document
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Import HTML Modal */}
      {showImportHtml && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowImportHtml(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 900,
              maxHeight: "90vh",
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📋</span> Import HTML Content
              </h2>
              <button
                type="button"
                onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: showHtmlPreview ? "#f3f4f6" : "white",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {showHtmlPreview ? "Hide Preview" : "Show Preview"}
              </button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              Paste your HTML content below. Use <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>ncc:</code> meta tags for auto-fill.
            </p>
            {parsedMeta && (parsedMeta.code || parsedMeta.title || parsedMeta.manualCode) && (
              <div
                style={{
                  padding: 12,
                  marginBottom: 12,
                  backgroundColor: parsedMeta.manualCode ? "#eff6ff" : "#f0fdf4",
                  border: `1px solid ${parsedMeta.manualCode ? "#93c5fd" : "#86efac"}`,
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8, color: parsedMeta.manualCode ? "#1e40af" : "#166534" }}>
                  ✓ Detected Metadata {parsedMeta.manualCode && "(with Manual Placement)"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 4, color: "#374151" }}>
                  {parsedMeta.code && <><span style={{ color: "#6b7280" }}>Code:</span><span style={{ fontFamily: "monospace" }}>{parsedMeta.code}</span></>}
                  {parsedMeta.title && <><span style={{ color: "#6b7280" }}>Title:</span><span>{parsedMeta.title}</span></>}
                  {parsedMeta.description && <><span style={{ color: "#6b7280" }}>Description:</span><span>{parsedMeta.description}</span></>}
                  {parsedMeta.category && <><span style={{ color: "#6b7280" }}>Category:</span><span>{parsedMeta.category}</span></>}
                </div>
                {parsedMeta.manualCode && (
                  <>
                    <div style={{ borderTop: "1px solid #bfdbfe", margin: "8px 0", paddingTop: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>📖 Manual Placement:</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 4, color: "#374151" }}>
                      <span style={{ color: "#6b7280" }}>Manual:</span>
                      <span>{parsedMeta.manualIcon || "📘"} {parsedMeta.manualTitle || parsedMeta.manualCode}</span>
                      <span style={{ color: "#6b7280" }}>Chapter:</span>
                      <span>#{parsedMeta.chapterNumber || "?"} — {parsedMeta.chapterTitle || parsedMeta.title}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 400 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>HTML Source</label>
                <textarea
                  value={importHtml}
                  onChange={(e) => {
                    setImportHtml(e.target.value);
                    parseHtmlMetadata(e.target.value);
                  }}
                  placeholder={`Paste your HTML here...

Supports NCC metadata tags:
<meta name="ncc:code" content="DOC-001" />
<meta name="ncc:title" content="Document Title" />
<meta name="ncc:description" content="..." />
<meta name="ncc:category" content="Handbook" />`}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontFamily: "monospace",
                    fontSize: 12,
                    resize: "none",
                    lineHeight: 1.5,
                  }}
                />
              </div>
              {showHtmlPreview && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Preview</label>
                  <div
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#fafafa",
                      overflow: "auto",
                      fontSize: 14,
                    }}
                    dangerouslySetInnerHTML={{ __html: importHtml }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowImportHtml(false);
                  setImportHtml("");
                  setShowHtmlPreview(false);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              {parsedMeta?.manualCode ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (!importHtml.trim()) {
                      alert("Please paste some HTML content first.");
                      return;
                    }
                    if (!parsedMeta?.code || !parsedMeta?.title) {
                      alert("Missing required ncc:code or ncc:title metadata.");
                      return;
                    }

                    const token = localStorage.getItem("accessToken");
                    const bodyContent = extractBodyContent(importHtml);

                    try {
                      // Call unified import endpoint
                      const res = await fetch(`${API_BASE}/system-documents/import-with-manual`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          // Document data
                          code: parsedMeta.code,
                          title: parsedMeta.title,
                          description: parsedMeta.description,
                          category: parsedMeta.category,
                          htmlContent: bodyContent || importHtml,
                          // Manual placement
                          manualCode: parsedMeta.manualCode,
                          manualTitle: parsedMeta.manualTitle,
                          manualIcon: parsedMeta.manualIcon,
                          chapterNumber: parsedMeta.chapterNumber ? parseInt(parsedMeta.chapterNumber, 10) : undefined,
                          chapterTitle: parsedMeta.chapterTitle,
                        }),
                      });

                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.message || "Failed to import");
                      }

                      const result = await res.json();
                      alert(`✓ Created document "${result.document.code}" and added to manual "${result.manual.code}" as Chapter ${result.chapter?.sortOrder ?? "?"}`);
                      
                      setShowImportHtml(false);
                      setImportHtml("");
                      setShowHtmlPreview(false);
                      setParsedMeta(null);
                      setImportMode("document");
                      loadDocuments();
                    } catch (err: any) {
                      alert(err.message || "Failed to import");
                    }
                  }}
                  disabled={!importHtml.trim() || !parsedMeta?.code}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "none",
                    background: importHtml.trim() && parsedMeta?.code ? "#7c3aed" : "#9ca3af",
                    color: "white",
                    cursor: importHtml.trim() && parsedMeta?.code ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📖 Import & Link to Manual
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!importHtml.trim()) {
                      alert("Please paste some HTML content first.");
                      return;
                    }
                    // Extract body content and transfer to create form
                    const bodyContent = extractBodyContent(importHtml);
                    setNewContent(bodyContent || importHtml);
                    // Auto-fill metadata if detected
                    if (parsedMeta) {
                      if (parsedMeta.code) setNewCode(parsedMeta.code);
                      if (parsedMeta.title) setNewTitle(parsedMeta.title);
                      if (parsedMeta.description) setNewDescription(parsedMeta.description);
                      if (parsedMeta.category) setNewCategory(parsedMeta.category);
                    }
                    setShowImportHtml(false);
                    setImportHtml("");
                    setShowHtmlPreview(false);
                    setParsedMeta(null);
                    setShowCreateForm(true);
                  }}
                  disabled={!importHtml.trim()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "none",
                    background: importHtml.trim() ? "#2563eb" : "#9ca3af",
                    color: "white",
                    cursor: importHtml.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Continue to Create Document →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowCreateForm(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Create System Document</h2>
            <form onSubmit={handleCreate}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Code *</span>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g., SOP-001"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                    required
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Title *</span>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Document title"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                    required
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Description</span>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Category</span>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g., Safety, HR, Operations"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Content (HTML) *</span>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="<h1>Document Title</h1><p>Content...</p>"
                    rows={8}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db", fontFamily: "monospace", fontSize: 12 }}
                    required
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    cursor: creating ? "default" : "pointer",
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading...</div>
      ) : documents.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No system documents yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/system/documents/${doc.id}`}
              style={{
                display: "block",
                padding: 16,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: doc.active ? "white" : "#f9fafb",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{doc.code}</span>
                    <span style={{ fontSize: 14 }}>{doc.title}</span>
                    {!doc.active && (
                      <span style={{ fontSize: 11, background: "#fee2e2", color: "#b91c1c", padding: "2px 6px", borderRadius: 4 }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {doc.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{doc.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, display: "flex", gap: 12 }}>
                    {doc.category && <span>Category: {doc.category}</span>}
                    <span>Version: {doc.currentVersion?.versionNo || 0}</span>
                    <span>Publications: {doc._count.publications}</span>
                    <span>Tenant Copies: {doc._count.tenantCopies}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Updated: {new Date(doc.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageCard>
  );
}
