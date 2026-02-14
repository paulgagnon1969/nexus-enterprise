"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ManualDocument {
  id: string;
  title: string;
  code: string;
  versionNo: number;
  htmlContent: string;
}

interface ManualChapter {
  id: string;
  title: string;
  description?: string;
  documents: ManualDocument[];
}

interface PublicManual {
  id: string;
  code: string;
  title: string;
  description?: string;
  version: number;
  iconEmoji?: string;
  coverImageUrl?: string;
  publishedAt: string;
  chapters: ManualChapter[];
  rootDocuments: ManualDocument[];
}

export default function PublicManualPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [manual, setManual] = useState<PublicManual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    loadManual();
  }, [slug]);

  async function loadManual() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/manuals/public/${slug}`);
      if (res.status === 404) {
        setError("Manual not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to load manual");
      const data = await res.json();
      setManual(data);
      
      // Set first document as active
      if (data.rootDocuments?.length > 0) {
        setActiveDocId(data.rootDocuments[0].id);
      } else if (data.chapters?.length > 0 && data.chapters[0].documents?.length > 0) {
        setActiveDocId(data.chapters[0].documents[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load manual");
    } finally {
      setLoading(false);
    }
  }

  // Get all documents flattened
  const getAllDocs = (): ManualDocument[] => {
    if (!manual) return [];
    const docs: ManualDocument[] = [...(manual.rootDocuments || [])];
    manual.chapters.forEach((ch) => {
      docs.push(...ch.documents);
    });
    return docs;
  };

  const activeDoc = getAllDocs().find((d) => d.id === activeDocId);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span>Loading manual...</span>
      </div>
    );
  }

  if (error || !manual) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorBox}>
          <h1 style={styles.errorTitle}>📘 Manual Not Found</h1>
          <p style={styles.errorText}>
            {error === "Manual not found"
              ? "This manual doesn't exist or isn't publicly available."
              : error}
          </p>
          <Link href="/" style={styles.homeLink}>
            ← Go to Home
          </Link>
        </div>
      </div>
    );
  }

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

      <div style={styles.layout}>
        {/* Sidebar - Table of Contents */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.manualIcon}>{manual.iconEmoji || "📘"}</div>
            <div>
              <h2 style={styles.manualTitle}>{manual.title}</h2>
              <div style={styles.manualVersion}>Version {manual.version}</div>
            </div>
          </div>

          <nav style={styles.toc}>
            {/* Root documents */}
            {manual.rootDocuments.length > 0 && (
              <div style={styles.tocSection}>
                {manual.rootDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    style={{
                      ...styles.tocItem,
                      ...(activeDocId === doc.id ? styles.tocItemActive : {}),
                    }}
                  >
                    <span style={styles.tocDocIcon}>📄</span>
                    <span style={styles.tocDocTitle}>{doc.title}</span>
                    <span style={styles.tocRev}>Rev {doc.versionNo}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Chapters */}
            {manual.chapters.map((chapter) => (
              <div key={chapter.id} style={styles.tocSection}>
                <div style={styles.tocChapter}>
                  <span style={styles.tocChapterIcon}>📁</span>
                  {chapter.title}
                </div>
                {chapter.documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    style={{
                      ...styles.tocItem,
                      ...styles.tocItemIndented,
                      ...(activeDocId === doc.id ? styles.tocItemActive : {}),
                    }}
                  >
                    <span style={styles.tocDocIcon}>📄</span>
                    <span style={styles.tocDocTitle}>{doc.title}</span>
                    <span style={styles.tocRev}>Rev {doc.versionNo}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main style={styles.main}>
          {activeDoc ? (
            <article style={styles.article}>
              <div style={styles.docHeader}>
                <h1 style={styles.docTitle}>{activeDoc.title}</h1>
                <div style={styles.docMeta}>
                  <span>Code: {activeDoc.code}</span>
                  <span style={styles.metaDivider}>•</span>
                  <span>Revision {activeDoc.versionNo}</span>
                </div>
              </div>
              <div
                style={styles.docContent}
                dangerouslySetInnerHTML={{ __html: activeDoc.htmlContent }}
              />
            </article>
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>📘</div>
              <h2 style={styles.placeholderTitle}>{manual.title}</h2>
              {manual.description && (
                <p style={styles.placeholderDesc}>{manual.description}</p>
              )}
              <p style={styles.placeholderHint}>
                Select a document from the sidebar to view its content.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>© {new Date().getFullYear()} NEXUS</span>
          <span style={styles.footerDivider}>•</span>
          <span>{manual.title} v{manual.version}</span>
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
  loadingContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
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
  errorContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
    flexShrink: 0,
  },
  headerContent: {
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
  layout: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  sidebar: {
    width: 300,
    flexShrink: 0,
    background: "#ffffff",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  sidebarHeader: {
    padding: 20,
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  manualIcon: {
    fontSize: 32,
  },
  manualTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#111827",
  },
  manualVersion: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  toc: {
    flex: 1,
    overflow: "auto",
    padding: "12px 0",
  },
  tocSection: {
    marginBottom: 8,
  },
  tocChapter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tocChapterIcon: {
    fontSize: 14,
  },
  tocItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 16px",
    fontSize: 14,
    color: "#4b5563",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  tocItemIndented: {
    paddingLeft: 32,
  },
  tocItemActive: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderLeft: "3px solid #2563eb",
  },
  tocDocIcon: {
    fontSize: 12,
    opacity: 0.7,
  },
  tocDocTitle: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tocRev: {
    fontSize: 10,
    color: "#9ca3af",
    flexShrink: 0,
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: 32,
  },
  article: {
    maxWidth: 900,
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  docHeader: {
    padding: "32px 40px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fafafa",
  },
  docTitle: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
  },
  docMeta: {
    display: "flex",
    gap: 8,
    fontSize: 12,
    color: "#6b7280",
  },
  metaDivider: {
    color: "#d1d5db",
  },
  docContent: {
    padding: "32px 40px",
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 64,
    color: "#6b7280",
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderTitle: {
    margin: "0 0 8px",
    fontSize: 24,
    color: "#111827",
  },
  placeholderDesc: {
    margin: "0 0 16px",
    maxWidth: 400,
    lineHeight: 1.5,
  },
  placeholderHint: {
    margin: 0,
    fontSize: 14,
    color: "#9ca3af",
  },
  footer: {
    background: "#ffffff",
    borderTop: "1px solid #e5e7eb",
    padding: "16px 24px",
    flexShrink: 0,
  },
  footerContent: {
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
