"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PublicDocument {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  versionNo: number;
  htmlContent: string;
  updatedAt: string;
}

export default function PublicDocumentPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [document, setDocument] = useState<PublicDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    loadDocument();
  }, [slug]);

  async function loadDocument() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/docs/${slug}`);
      if (res.status === 404) {
        setError("Document not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to load document");
      const data = await res.json();
      setDocument(data);
    } catch (err: any) {
      setError(err.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner} />
          <span>Loading document...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h1 style={styles.errorTitle}>📄 Document Not Found</h1>
          <p style={styles.errorText}>
            {error === "Document not found"
              ? "This document doesn't exist or isn't publicly available."
              : error}
          </p>
          <Link href="/" style={styles.homeLink}>
            ← Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div style={styles.pageWrapper}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <Link href="/" style={styles.logo}>
            NEXUS
          </Link>
          <span style={styles.headerDivider}>|</span>
          <span style={styles.headerLabel}>Documentation</span>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <article style={styles.article}>
          {/* Document Header */}
          <div style={styles.docHeader}>
            <div style={styles.breadcrumb}>
              {document.category && (
                <>
                  <span style={styles.breadcrumbItem}>{document.category}</span>
                  {document.subcategory && (
                    <>
                      <span style={styles.breadcrumbDivider}>/</span>
                      <span style={styles.breadcrumbItem}>{document.subcategory}</span>
                    </>
                  )}
                </>
              )}
            </div>
            <h1 style={styles.title}>{document.title}</h1>
            {document.description && (
              <p style={styles.description}>{document.description}</p>
            )}
            <div style={styles.meta}>
              <span>Document Code: {document.code}</span>
              <span style={styles.metaDivider}>•</span>
              <span>Version {document.versionNo}</span>
              <span style={styles.metaDivider}>•</span>
              <span>Updated {new Date(document.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Document Content */}
          <div
            style={styles.content}
            dangerouslySetInnerHTML={{ __html: document.htmlContent }}
          />
        </article>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>© {new Date().getFullYear()} NEXUS</span>
          <span style={styles.footerDivider}>•</span>
          <span>Document v{document.versionNo}</span>
        </div>
      </footer>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#f9fafb",
  },
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "#f9fafb",
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    color: "#6b7280",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e5e7eb",
    borderTopColor: "#2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  errorBox: {
    textAlign: "center",
    maxWidth: 400,
  },
  errorTitle: {
    margin: "0 0 12px",
    fontSize: 24,
    color: "#111827",
  },
  errorText: {
    margin: "0 0 24px",
    color: "#6b7280",
    fontSize: 14,
  },
  homeLink: {
    color: "#2563eb",
    textDecoration: "none",
    fontSize: 14,
  },
  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    padding: "16px 24px",
  },
  headerContent: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    fontWeight: 700,
    fontSize: 18,
    color: "#111827",
    textDecoration: "none",
  },
  headerDivider: {
    color: "#d1d5db",
  },
  headerLabel: {
    color: "#6b7280",
    fontSize: 14,
  },
  main: {
    flex: 1,
    padding: "32px 24px",
  },
  article: {
    maxWidth: 900,
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    overflow: "hidden",
  },
  docHeader: {
    padding: "32px 40px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fafafa",
  },
  breadcrumb: {
    marginBottom: 12,
    fontSize: 12,
    color: "#6b7280",
  },
  breadcrumbItem: {
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  breadcrumbDivider: {
    margin: "0 8px",
    color: "#d1d5db",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.2,
  },
  description: {
    margin: "0 0 16px",
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 1.5,
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    fontSize: 12,
    color: "#9ca3af",
  },
  metaDivider: {
    margin: "0 4px",
  },
  content: {
    padding: "32px 40px",
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
  },
  footer: {
    background: "#ffffff",
    borderTop: "1px solid #e5e7eb",
    padding: "16px 24px",
  },
  footerContent: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    justifyContent: "center",
    gap: 8,
    fontSize: 12,
    color: "#9ca3af",
  },
  footerDivider: {
    color: "#d1d5db",
  },
};
