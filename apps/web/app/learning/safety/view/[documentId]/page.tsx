"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface DocumentHtmlResponse {
  id: string;
  title: string;
  htmlContent: string | null;
  conversionStatus: "PENDING" | "CONVERTING" | "COMPLETED" | "FAILED" | "SKIPPED" | null;
  conversionError: string | null;
  hasOriginal: boolean;
  originalPath: string;
}

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentHtmlResponse | null>(null);

  useEffect(() => {
    async function fetchDocument() {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`${API_BASE}/document-import/documents/${documentId}/html`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("Document not found");
          } else {
            setError("Failed to load document");
          }
          return;
        }

        const data = await res.json();
        setDocument(data);
      } catch (err) {
        setError("Failed to load document");
      } finally {
        setLoading(false);
      }
    }

    if (documentId) {
      fetchDocument();
    }
  }, [documentId]);

  const handlePrint = () => {
    window.print();
  };

  const handleViewOriginal = () => {
    if (document) {
      const token = localStorage.getItem("accessToken");
      window.open(
        `${API_BASE}/document-import/documents/${documentId}/preview?token=${token}`,
        "_blank"
      );
    }
  };

  const handleBack = () => {
    router.push("/learning/safety");
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p style={{ color: "#6b7280", marginTop: 16 }}>Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>⚠️</span>
          <h2 style={{ margin: 0, color: "#991b1b" }}>{error || "Document not found"}</h2>
          <button onClick={handleBack} style={styles.backButton}>
            ← Back to Safety Manual
          </button>
        </div>
      </div>
    );
  }

  // Handle conversion states
  if (document.conversionStatus === "PENDING" || document.conversionStatus === "CONVERTING") {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <h2 style={{ margin: "16px 0 8px", color: "#1f2937" }}>Converting Document</h2>
          <p style={{ color: "#6b7280", margin: 0 }}>
            This document is being converted to HTML for fast viewing...
          </p>
          <button onClick={handleViewOriginal} style={{ ...styles.secondaryButton, marginTop: 24 }}>
            View Original File
          </button>
        </div>
      </div>
    );
  }

  if (document.conversionStatus === "FAILED" || document.conversionStatus === "SKIPPED") {
    return (
      <div style={styles.container}>
        <div style={styles.toolbar} className="no-print">
          <button onClick={handleBack} style={styles.toolbarButton}>
            ← Back
          </button>
          <h1 style={styles.toolbarTitle}>{document.title}</h1>
          <button onClick={handleViewOriginal} style={styles.primaryButton}>
            View Original
          </button>
        </div>
        <div style={styles.warningCard}>
          <span style={{ fontSize: 32, marginBottom: 12 }}>📄</span>
          <h3 style={{ margin: "0 0 8px", color: "#92400e" }}>
            {document.conversionStatus === "SKIPPED" ? "Conversion Not Available" : "Conversion Failed"}
          </h3>
          <p style={{ color: "#78350f", margin: "0 0 16px", fontSize: 14 }}>
            {document.conversionError || "This document type cannot be converted to HTML."}
          </p>
          <button onClick={handleViewOriginal} style={styles.primaryButton}>
            Open Original Document
          </button>
        </div>
      </div>
    );
  }

  // Success - render HTML content
  return (
    <div style={styles.container}>
      {/* Toolbar - hidden when printing */}
      <div style={styles.toolbar} className="no-print">
        <button onClick={handleBack} style={styles.toolbarButton}>
          ← Back
        </button>
        <h1 style={styles.toolbarTitle}>{document.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleViewOriginal} style={styles.secondaryButton}>
            View Original
          </button>
          <button onClick={handlePrint} style={styles.primaryButton}>
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Document frame */}
      <div style={styles.documentFrame}>
        {document.htmlContent ? (
          <div
            dangerouslySetInnerHTML={{ __html: extractBodyContent(document.htmlContent) }}
            style={styles.documentContent}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
            <p>No content available</p>
            <button onClick={handleViewOriginal} style={styles.primaryButton}>
              View Original Document
            </button>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Extract body content from full HTML document.
 * We render just the body to avoid duplicate <html>/<head> tags.
 */
function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  // If no body tags, return as-is (might be a fragment)
  return html;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    paddingBottom: 40,
  },
  toolbar: {
    position: "sticky",
    top: 0,
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    zIndex: 100,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  toolbarTitle: {
    flex: 1,
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#1f2937",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  toolbarButton: {
    padding: "8px 16px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  primaryButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    backgroundColor: "#dc2626",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "8px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  documentFrame: {
    maxWidth: "8.5in",
    margin: "24px auto",
    backgroundColor: "#ffffff",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
    borderRadius: 4,
    overflow: "hidden",
  },
  documentContent: {
    padding: "1in",
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  loadingCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
  },
  errorCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    textAlign: "center",
  },
  warningCard: {
    maxWidth: 500,
    margin: "40px auto",
    padding: 32,
    backgroundColor: "#fffbeb",
    border: "1px solid #fcd34d",
    borderRadius: 8,
    textAlign: "center",
  },
  backButton: {
    marginTop: 24,
    padding: "10px 20px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid #e5e7eb",
    borderTopColor: "#dc2626",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};
