"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DOMPurify from "dompurify";
import { TenantPublishModal } from "../components/TenantPublishModal";

// Extract body content from full HTML documents
function extractBodyContent(html: string): string {
  // If it's a full HTML document, extract just the body content
  if (html.includes('<!DOCTYPE') || html.includes('<html') || html.includes('<body')) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1].trim();
    }
  }
  return html;
}

// Sanitize HTML content while preserving mermaid blocks
function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html; // SSR fallback
  
  // First extract body content if it's a full HTML document
  const content = extractBodyContent(html);
  
  // Configure DOMPurify to preserve mermaid blocks
  return DOMPurify.sanitize(content, {
    ADD_TAGS: ["div", "pre", "code", "br", "span"], // Allow mermaid containers
    ADD_ATTR: ["class", "style", "id"], // Allow class="mermaid" and inline styles
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link", "html", "head", "body"], // Block dangerous/structural tags
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur"], // Block event handlers
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

// Mermaid rendering hook - renders .mermaid divs after content loads
function useMermaidRender(htmlContent: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!htmlContent || !containerRef.current) return;
    
    // Check if there are any mermaid blocks to render
    const mermaidBlocks = containerRef.current.querySelectorAll('.mermaid:not([data-processed])');
    if (mermaidBlocks.length === 0) return;
    
    // Dynamically import mermaid only when needed
    import('mermaid').then(async (mermaidModule) => {
      const mermaid = mermaidModule.default;
      mermaid.initialize({ 
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict', // Prevents XSS
        fontFamily: 'system-ui, -apple-system, sans-serif',
        themeVariables: {
          primaryColor: '#0d47a1',
          primaryTextColor: '#ffffff',
          secondaryColor: '#e3f2fd',
          lineColor: '#0d47a1',
        },
      });
      
      // Render each mermaid block individually for better error handling
      for (const block of Array.from(mermaidBlocks)) {
        // Get the raw HTML and convert to Mermaid-compatible code
        let code = block.innerHTML;
        
        // Convert <br> tags to Mermaid's line break syntax within node labels
        // Mermaid uses <br/> as literal text for line breaks in labels
        code = code
          .replace(/<br\s*\/?>/gi, '<br/>')  // Normalize all br tags
          .replace(/&lt;/g, '<')              // Decode HTML entities
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        
        // Remove any HTML tags EXCEPT <br/> which Mermaid uses for line breaks
        // This regex keeps <br/> but removes other tags
        code = code.replace(/<(?!\/?(br)\s*\/?>)[^>]+>/gi, '').trim();
        
        if (!code) continue;
        
        try {
          const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
          const { svg } = await mermaid.render(id, code);
          block.innerHTML = svg;
          block.setAttribute('data-processed', 'true');
        } catch (err: any) {
          console.error('Mermaid render error:', err);
          block.innerHTML = `<div style="padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; color: #b91c1c; font-size: 13px;">
            <strong>Diagram Error:</strong> ${err?.message || 'Invalid Mermaid syntax'}
            <pre style="margin-top: 8px; font-size: 11px; overflow: auto;">${code.substring(0, 200)}${code.length > 200 ? '...' : ''}</pre>
          </div>`;
          block.setAttribute('data-processed', 'true');
        }
      }
    }).catch((err) => {
      console.error('Failed to load Mermaid:', err);
    });
  }, [htmlContent, containerRef]);
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocumentVersion {
  id: string;
  versionNo: number;
  htmlContent: string;
  notes: string | null;
  createdAt: string;
  createdByUserId: string;
}

interface Publication {
  id: string;
  targetType: "ALL_TENANTS" | "SINGLE_TENANT";
  targetCompany: { id: string; name: string } | null;
  publishedAt: string;
  retractedAt: string | null;
  systemDocumentVersion: { versionNo: number };
}

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  active: boolean;
  isPublic: boolean;
  publicSlug: string | null;
  currentVersion: SystemDocumentVersion | null;
  versions: SystemDocumentVersion[];
  publications: Publication[];
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export default function SystemDocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [document, setDocument] = useState<SystemDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editingHtml, setEditingHtml] = useState(false); // Structured HTML edit mode
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<any> | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  // Publish modal
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);

  // PDF generation state
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Reader mode (full-width document view)
  const [readerMode, setReaderMode] = useState(false);

  // Ref for document content container (for Mermaid rendering)
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Render Mermaid diagrams when content loads
  useMermaidRender(document?.currentVersion?.htmlContent, contentRef);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);

  // Dynamically import RichTextEditor
  useEffect(() => {
    import("../../../components/RichTextEditor").then((mod) => {
      setEditorComponent(() => mod.RichTextEditor);
    });
  }, []);

  async function loadDocument() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load document");
      const data = await res.json();
      setDocument(data);
    } catch (err: any) {
      setError(err.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    if (!document) return;
    setEditTitle(document.title);
    setEditDescription(document.description || "");
    setEditCategory(document.category || "");
    setEditContent(document.currentVersion?.htmlContent || "");
    setEditNotes("");
    setEditingHtml(false);
    setEditing(true);
  }

  function startEditingHtml() {
    if (!document) return;
    setEditTitle(document.title);
    setEditDescription(document.description || "");
    setEditCategory(document.category || "");
    setEditContent(document.currentVersion?.htmlContent || "");
    setEditNotes("");
    setEditingHtml(true);
    setShowHtmlPreview(false);
    setEditing(true);
  }

  async function handleSave() {
    if (!document || !editContent.trim()) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || undefined,
          category: editCategory.trim() || undefined,
          htmlContent: editContent,
          notes: editNotes.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setEditing(false);
      setEditingHtml(false);
      loadDocument();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetract(publicationId: string) {
    if (!confirm("Retract this publication? Tenants will no longer see this document.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/publications/${publicationId}/retract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to retract");
      loadDocument();
    } catch (err: any) {
      alert(err.message || "Failed to retract");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this document? This will deactivate it and hide it from the list.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete");
      router.push("/system/documents");
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading...</div>;
  }

  if (error || !document) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 16 }}>{error || "Document not found"}</div>
        <Link href="/system/documents" style={{ color: "#2563eb" }}>← Back to documents</Link>
      </div>
    );
  }

  const activePublications = document.publications.filter((p) => !p.retractedAt);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/system/documents" style={{ color: "#2563eb", fontSize: 13 }}>← Back to documents</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>
            {document.code}: {document.title}
          </h1>
          {document.description && (
            <div style={{ color: "#6b7280", marginTop: 4 }}>{document.description}</div>
          )}
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
            Created by: {document.createdBy.firstName} {document.createdBy.lastName} ({document.createdBy.email})
            {document.category && <span> · Category: {document.category}</span>}
            · Version: {document.currentVersion?.versionNo || 0}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!editing && (
            <>
              <button
                onClick={() => setReaderMode(!readerMode)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: readerMode ? "1px solid #2563eb" : "1px solid #d1d5db",
                  background: readerMode ? "#eff6ff" : "white",
                  color: readerMode ? "#2563eb" : "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title={readerMode ? "Exit reader mode" : "Full-width reader mode"}
              >
                📖 {readerMode ? "Exit Reader" : "Reader Mode"}
              </button>
              <button
                onClick={() => {
                  if (!document) return;
                  generateAndDownloadPdf(
                    document,
                    () => setGeneratingPdf(true),
                    () => setGeneratingPdf(false),
                    (msg) => { setGeneratingPdf(false); alert(msg); }
                  );
                }}
                disabled={generatingPdf}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: generatingPdf ? "#f3f4f6" : "white",
                  fontSize: 13,
                  cursor: generatingPdf ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  opacity: generatingPdf ? 0.7 : 1,
                }}
              >
                {generatingPdf ? "⏳ Generating..." : "📄 Download PDF"}
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: document.isPublic ? "#7c3aed" : "#6b7280",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                🔗 {document.isPublic ? "Public" : "Share"}
              </button>
              <button
                onClick={startEditing}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
              <button
                onClick={startEditingHtml}
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
                📝 Edit Structured HTML
              </button>
              <button
                onClick={() => setShowPublishModal(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Publish
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Title</span>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Description</span>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Category</span>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span>Content {editingHtml && "(Structured HTML)"}</span>
                {editingHtml && (
                  <button
                    type="button"
                    onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: showHtmlPreview ? "#f3f4f6" : "white",
                      cursor: "pointer",
                    }}
                  >
                    {showHtmlPreview ? "Hide Preview" : "Show Preview"}
                  </button>
                )}
              </div>
              {editingHtml ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Paste your structured HTML here..."
                    style={{
                      flex: 1,
                      minHeight: 400,
                      padding: 12,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontFamily: "monospace",
                      fontSize: 12,
                      lineHeight: 1.5,
                      resize: "vertical",
                    }}
                  />
                  {showHtmlPreview && (
                    <div
                      style={{
                        flex: 1,
                        minHeight: 400,
                        padding: 12,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        backgroundColor: "#fafafa",
                        overflow: "auto",
                        fontSize: 14,
                      }}
                      dangerouslySetInnerHTML={{ __html: editContent }}
                    />
                  )}
                </div>
              ) : EditorComponent ? (
                <EditorComponent content={editContent} onChange={setEditContent} />
              ) : (
                <div style={{ padding: 16, color: "#9ca3af", border: "1px solid #d1d5db", borderRadius: 6 }}>
                  Loading editor...
                </div>
              )}
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Revision Notes</span>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="What changed in this version?"
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => {
                setEditing(false);
                setEditingHtml(false);
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
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Content Preview */}
          <div 
            style={{ 
              background: "white", 
              border: "1px solid #e5e7eb", 
              borderRadius: 8, 
              padding: readerMode ? "32px 48px" : 16, 
              marginBottom: 24,
              ...(readerMode ? {
                position: "fixed",
                inset: 0,
                zIndex: 100,
                overflow: "auto",
                borderRadius: 0,
              } : {})
            }}
          >
            {readerMode && (
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                marginBottom: 24,
                paddingBottom: 16,
                borderBottom: "1px solid #e5e7eb",
              }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 24 }}>{document.code}: {document.title}</h1>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Version {document.currentVersion?.versionNo || 0}
                    {document.category && ` · ${document.category}`}
                  </div>
                </div>
                <button
                  onClick={() => setReaderMode(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "white",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ✕ Close Reader Mode
                </button>
              </div>
            )}
            {!readerMode && <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>Content Preview</h3>}
            <div
              ref={contentRef}
              style={{ 
                fontSize: readerMode ? 16 : 14, 
                lineHeight: 1.8,
                maxWidth: readerMode ? 900 : "none",
                margin: readerMode ? "0 auto" : 0,
              }}
              className="document-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(document.currentVersion?.htmlContent || "<em>No content</em>") }}
            />
          </div>

          {/* Publications */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
              Active Publications ({activePublications.length})
            </h3>
            {activePublications.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Not published yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activePublications.map((pub) => (
                  <div
                    key={pub.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 8,
                      background: "#f9fafb",
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      {pub.targetType === "ALL_TENANTS" ? (
                        <span style={{ fontWeight: 500 }}>All Tenants</span>
                      ) : (
                        <span>{pub.targetCompany?.name || "Unknown company"}</span>
                      )}
                      <span style={{ color: "#9ca3af", marginLeft: 8 }}>
                        v{pub.systemDocumentVersion?.versionNo ?? "?"} · {new Date(pub.publishedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRetract(pub.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #fca5a5",
                        background: "white",
                        color: "#b91c1c",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Retract
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Version History */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
              Version History ({document.versions.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {document.versions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    padding: 8,
                    background: v.id === document.currentVersion?.id ? "#eff6ff" : "#f9fafb",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      <strong>v{v.versionNo}</strong>
                      {v.id === document.currentVersion?.id && (
                        <span style={{ color: "#2563eb", marginLeft: 8 }}>(current)</span>
                      )}
                    </span>
                    <span style={{ color: "#9ca3af" }}>{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                  {v.notes && <div style={{ color: "#6b7280", marginTop: 4 }}>{v.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Share Modal */}
      {showShareModal && document && (
        <ShareModal
          documentId={document.id}
          documentCode={document.code}
          isPublic={document.isPublic}
          publicSlug={document.publicSlug}
          onClose={() => setShowShareModal(false)}
          onUpdate={loadDocument}
        />
      )}

      {/* Publish Modal */}
      {showPublishModal && document && (
        <TenantPublishModal
          documentId={document.id}
          documentCode={document.code}
          documentTitle={document.title}
          onClose={() => setShowPublishModal(false)}
          onSuccess={loadDocument}
        />
      )}

    </div>
  );
}

// --- Share Modal ---

function ShareModal({
  documentId,
  documentCode,
  isPublic,
  publicSlug,
  onClose,
  onUpdate,
}: {
  documentId: string;
  documentCode: string;
  isPublic: boolean;
  publicSlug: string | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [localSlug, setLocalSlug] = useState(publicSlug || documentCode.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/docs/${localSlug}`
    : `/docs/${localSlug}`;

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal`
    : `/portal`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system/documents/${documentId}/public-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isPublic: localIsPublic,
          publicSlug: localIsPublic ? localSlug : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update settings");
      }
      onUpdate();
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: 480,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>🔗 Share Document</h2>

        <div style={{ marginTop: 20 }}>
          {/* Public Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              background: localIsPublic ? "#f0fdf4" : "#f9fafb",
              borderRadius: 8,
              border: `1px solid ${localIsPublic ? "#86efac" : "#e5e7eb"}`,
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Public Access</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Anyone with the link can view (read-only)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLocalIsPublic(!localIsPublic)}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                background: localIsPublic ? "#22c55e" : "#d1d5db",
                border: "none",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "white",
                  position: "absolute",
                  top: 3,
                  left: localIsPublic ? 23 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>

          {/* Public URL settings */}
          {localIsPublic && (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                Public URL Slug
              </label>
              <input
                type="text"
                value={localSlug}
                onChange={(e) => setLocalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="my-document"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Direct URL: <span style={{ fontFamily: "monospace" }}>{publicUrl}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                Also visible on: <a href={portalUrl} target="_blank" style={{ color: "#2563eb" }}>/portal</a>
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 16px",
                  fontSize: 14,
                  background: copied ? "#dcfce7" : "#f3f4f6",
                  color: copied ? "#166534" : "#374151",
                  border: `1px solid ${copied ? "#86efac" : "#d1d5db"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                {copied ? "✓ Copied!" : "📋 Copy Public Link"}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              background: "white",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: saving ? "#9ca3af" : "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        </div>
      </div>
    </div>
  );
}

// --- PDF Download Function ---

async function generateAndDownloadPdf(
  document: SystemDocument,
  onStart: () => void,
  onComplete: () => void,
  onError: (msg: string) => void
) {
  onStart();
  
  try {
    const html2pdf = (await import('html2pdf.js')).default;
    
    // Build the HTML content for the PDF
    const htmlContent = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 0.5in; background: white;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #0f172a;">NEXUS</div>
            <div style="font-size: 10px; color: #6b7280;">Contractor Connect</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #6b7280;">Document Code</div>
            <div style="font-size: 14px; font-weight: 600;">${document.code}</div>
            <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">Version ${document.currentVersion?.versionNo || 1}</div>
          </div>
        </div>
        
        <!-- Title -->
        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #0f172a;">${document.title}</h1>
        ${document.description ? `<p style="font-size: 12px; color: #6b7280; margin: 0 0 16px;">${document.description}</p>` : ''}
        
        <!-- Meta -->
        <div style="display: flex; gap: 16px; font-size: 10px; color: #6b7280; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
          ${document.category ? `<div><span style="color: #9ca3af;">Category:</span> ${document.category}</div>` : ''}
          <div><span style="color: #9ca3af;">Last Updated:</span> ${document.currentVersion?.createdAt ? new Date(document.currentVersion.createdAt).toLocaleDateString() : '—'}</div>
        </div>
        
        <!-- Body -->
        <div style="font-size: 11px; line-height: 1.6; color: #1f2937;">
          ${document.currentVersion?.htmlContent || '<em>No content</em>'}
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af;">
          <div>© ${new Date().getFullYear()} NFS Group / Nexus Contractor Connect</div>
          <div>${document.code} v${document.currentVersion?.versionNo || 1} • Generated ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    `;
    
    const filename = `${document.code}-${document.title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    
    await html2pdf()
      .set({
        margin: [0.25, 0.25, 0.25, 0.25] as [number, number, number, number],
        filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const },
      })
      .from(htmlContent)
      .save();
    
    onComplete();
  } catch (err: any) {
    console.error('PDF generation error:', err);
    onError(err?.message || 'Failed to generate PDF');
  }
}
