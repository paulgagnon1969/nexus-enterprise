"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ImportResult {
  manual: {
    id: string;
    code: string;
    title: string;
    isPublic: boolean;
    publicSlug: string | null;
  };
  documents: Array<{ code: string; title: string; isNew: boolean }>;
  summary: {
    totalChapters: number;
    newDocuments: number;
    updatedDocuments: number;
  };
}

interface ImportHtmlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: ImportResult) => void;
}

export function ImportHtmlModal({ isOpen, onClose, onSuccess }: ImportHtmlModalProps) {
  const [htmlContent, setHtmlContent] = useState("");
  const [setPublic, setSetPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!htmlContent.trim()) {
      setError("Please paste HTML content");
      return;
    }

    // Quick validation for required meta tags
    if (!htmlContent.includes('name="ncc:manual-code"') && !htmlContent.includes("name='ncc:manual-code'")) {
      setError("Missing required meta tag: ncc:manual-code");
      return;
    }
    if (!htmlContent.includes('name="ncc:manual-title"') && !htmlContent.includes("name='ncc:manual-title'")) {
      setError("Missing required meta tag: ncc:manual-title");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/import-from-html`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          htmlContent,
          setPublic: setPublic ? "true" : "false",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Import failed");
      }

      const data: ImportResult = await res.json();
      setResult(data);
      onSuccess?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setHtmlContent("");
    setSetPublic(false);
    setError(null);
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: 700,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📥</span> Structured Manual Import
          </h2>
          <button
            onClick={handleClose}
            style={{
              border: "none",
              background: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            ✕
          </button>
        </div>

        {/* Success Result */}
        {result ? (
          <div>
            <div
              style={{
                backgroundColor: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <strong>Import Successful!</strong>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                Manual: <strong>{result.manual.title}</strong> ({result.manual.code})
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#059669" }}>
                {result.summary.newDocuments} new, {result.summary.updatedDocuments} updated
              </p>
            </div>

            {/* Imported Documents List */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Imported Chapters:</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151" }}>
                {result.documents.map((doc) => (
                  <li key={doc.code} style={{ marginBottom: 4 }}>
                    {doc.title} <span style={{ color: "#9ca3af" }}>({doc.code})</span>
                    {doc.isNew && <span style={{ color: "#059669", marginLeft: 6 }}>NEW</span>}
                  </li>
                ))}
              </ul>
            </div>

            {result.manual.isPublic && result.manual.publicSlug && (
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                🔗 Public URL: <code>/manuals/{result.manual.publicSlug}</code>
              </p>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                onClick={handleClose}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Done
              </button>
              <a
                href={`/system/documents/manuals/${result.manual.id}`}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                View Manual →
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
              Paste Grok-generated HTML with <code>&lt;meta name="ncc:..."&gt;</code> tags.
              All metadata is extracted automatically.
            </p>

            {/* Error Display */}
            {error && (
              <div
                style={{
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                  color: "#dc2626",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            {/* Textarea */}
            <textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder={`<!DOCTYPE html>
<html>
<head>
  <meta name="ncc:manual-code" content="IRB-ELMCREEK" />
  <meta name="ncc:manual-title" content="Elm Creek Investor Prospectus" />
  <meta name="ncc:library" content="Investor Relations" />
  ...
</head>
<body>
  <div id="ch1" class="chapter">
    <h1>Chapter Title</h1>
    ...
  </div>
</body>
</html>`}
              style={{
                width: "100%",
                height: 300,
                padding: 12,
                fontSize: 13,
                fontFamily: "monospace",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                resize: "vertical",
              }}
              disabled={loading}
            />

            {/* Options */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="setPublic"
                checked={setPublic}
                onChange={(e) => setSetPublic(e.target.checked)}
                disabled={loading}
              />
              <label htmlFor="setPublic" style={{ fontSize: 14, color: "#374151" }}>
                Make publicly accessible (uses <code>ncc:public-slug</code> from HTML)
              </label>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                onClick={handleClose}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={loading || !htmlContent.trim()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: loading ? "#9ca3af" : "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: loading ? "wait" : "pointer",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                    Importing...
                  </>
                ) : (
                  <>📥 Import</>
                )}
              </button>
            </div>

            {/* Help Text */}
            <details style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>Required HTML Structure</summary>
              <div style={{ marginTop: 8, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6 }}>
                <p style={{ margin: "0 0 8px" }}><strong>Required meta tags:</strong></p>
                <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                  <li><code>ncc:manual-code</code> - Unique identifier (e.g., "IRB-ELMCREEK")</li>
                  <li><code>ncc:manual-title</code> - Display title</li>
                </ul>
                <p style={{ margin: "0 0 8px" }}><strong>Optional meta tags:</strong></p>
                <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                  <li><code>ncc:manual-icon</code> - Emoji (default: 📘)</li>
                  <li><code>ncc:library</code> - Library grouping</li>
                  <li><code>ncc:category</code> - Category</li>
                  <li><code>ncc:description</code> - Brief description</li>
                  <li><code>ncc:public</code> - "true" for public access</li>
                  <li><code>ncc:public-slug</code> - URL slug</li>
                </ul>
                <p style={{ margin: 0 }}><strong>Chapter structure:</strong></p>
                <code style={{ display: "block", marginTop: 4 }}>
                  &lt;div id="ch1" class="chapter"&gt;...&lt;/div&gt;
                </code>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
