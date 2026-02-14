"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PublicManual {
  id: string;
  code: string;
  title: string;
  description?: string;
  slug: string;
  iconEmoji?: string;
  coverImageUrl?: string;
  version: number;
  publishedAt: string;
  chapterCount: number;
  documentCount: number;
}

interface PublicDocument {
  id: string;
  code: string;
  title: string;
  description?: string;
  slug: string;
  category?: string;
  subcategory?: string;
  versionNo: number;
  updatedAt: string;
}

interface PortalData {
  manuals: PublicManual[];
  documents: PublicDocument[];
}

export default function PublicPortalPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortalData();
  }, []);

  async function loadPortalData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/portal`);
      if (!res.ok) throw new Error("Failed to load portal");
      const portalData = await res.json();
      setData(portalData);
    } catch (err: any) {
      setError(err.message || "Failed to load portal");
    } finally {
      setLoading(false);
    }
  }

  // Group documents by category
  const groupedDocs = data?.documents.reduce((acc, doc) => {
    const cat = doc.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, PublicDocument[]>) || {};

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span>Loading documentation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h1 style={styles.errorTitle}>Unable to load portal</h1>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  const hasContent = (data?.manuals.length || 0) + (data?.documents.length || 0) > 0;

  return (
    <div style={styles.pageWrapper}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <Link href="/" style={styles.logo}>
            NEXUS
          </Link>
          <span style={styles.headerDivider}>|</span>
          <span style={styles.headerLabel}>Documentation Portal</span>
        </div>
      </header>

      {/* Hero */}
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>📚 Documentation Portal</h1>
        <p style={styles.heroSubtitle}>
          Browse our collection of manuals, guides, and documentation
        </p>
      </section>

      {/* Main Content */}
      <main style={styles.main}>
        {!hasContent ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📭</div>
            <h2 style={styles.emptyTitle}>No Public Content Available</h2>
            <p style={styles.emptyText}>
              There are no public manuals or documents available at this time.
            </p>
          </div>
        ) : (
          <>
            {/* Manuals Section */}
            {data?.manuals && data.manuals.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  <span style={styles.sectionIcon}>📘</span>
                  Manuals
                </h2>
                <div style={styles.cardGrid}>
                  {data.manuals.map((manual) => (
                    <Link
                      key={manual.id}
                      href={`/manuals/${manual.slug}`}
                      style={styles.card}
                    >
                      <div style={styles.cardIcon}>
                        {manual.iconEmoji || "📘"}
                      </div>
                      <div style={styles.cardContent}>
                        <h3 style={styles.cardTitle}>{manual.title}</h3>
                        {manual.description && (
                          <p style={styles.cardDescription}>{manual.description}</p>
                        )}
                        <div style={styles.cardMeta}>
                          <span>Version {manual.version}</span>
                          <span style={styles.metaDot}>•</span>
                          <span>{manual.chapterCount} chapters</span>
                          <span style={styles.metaDot}>•</span>
                          <span>{manual.documentCount} docs</span>
                        </div>
                      </div>
                      <div style={styles.cardArrow}>→</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Documents Section */}
            {data?.documents && data.documents.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  <span style={styles.sectionIcon}>📄</span>
                  Documents
                </h2>
                {Object.entries(groupedDocs).map(([category, docs]) => (
                  <div key={category} style={styles.categoryGroup}>
                    <h3 style={styles.categoryTitle}>{category}</h3>
                    <div style={styles.docList}>
                      {docs.map((doc) => (
                        <Link
                          key={doc.id}
                          href={`/docs/${doc.slug}`}
                          style={styles.docItem}
                        >
                          <div style={styles.docIcon}>📄</div>
                          <div style={styles.docContent}>
                            <div style={styles.docTitle}>{doc.title}</div>
                            {doc.description && (
                              <div style={styles.docDescription}>{doc.description}</div>
                            )}
                          </div>
                          <div style={styles.docMeta}>
                            <span style={styles.docVersion}>Rev {doc.versionNo}</span>
                            <span style={styles.docArrow}>→</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>© {new Date().getFullYear()} NEXUS</span>
          <span style={styles.footerDivider}>•</span>
          <span>Documentation Portal</span>
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
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 24,
  },
  errorTitle: {
    margin: "0 0 8px",
    fontSize: 24,
    color: "#111827",
  },
  errorText: {
    margin: 0,
    color: "#6b7280",
  },
  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    padding: "16px 24px",
  },
  headerContent: {
    maxWidth: 1200,
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
  hero: {
    background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
    padding: "64px 24px",
    textAlign: "center",
  },
  heroTitle: {
    margin: "0 0 12px",
    fontSize: 36,
    fontWeight: 700,
    color: "#ffffff",
  },
  heroSubtitle: {
    margin: 0,
    fontSize: 18,
    color: "rgba(255, 255, 255, 0.85)",
  },
  main: {
    flex: 1,
    maxWidth: 1200,
    margin: "0 auto",
    padding: "48px 24px",
    width: "100%",
  },
  emptyState: {
    textAlign: "center",
    padding: 64,
    background: "#ffffff",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    margin: "0 0 8px",
    fontSize: 24,
    color: "#111827",
  },
  emptyText: {
    margin: 0,
    color: "#6b7280",
  },
  section: {
    marginBottom: 48,
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "0 0 24px",
    fontSize: 24,
    fontWeight: 600,
    color: "#111827",
  },
  sectionIcon: {
    fontSize: 28,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
    gap: 20,
  },
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: 24,
    background: "#ffffff",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    textDecoration: "none",
    color: "inherit",
    transition: "box-shadow 0.2s, transform 0.2s",
  },
  cardIcon: {
    fontSize: 40,
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: "0 0 8px",
    fontSize: 18,
    fontWeight: 600,
    color: "#111827",
  },
  cardDescription: {
    margin: "0 0 12px",
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    fontSize: 12,
    color: "#9ca3af",
  },
  metaDot: {
    margin: "0 4px",
  },
  cardArrow: {
    fontSize: 20,
    color: "#9ca3af",
    flexShrink: 0,
  },
  categoryGroup: {
    marginBottom: 32,
  },
  categoryTitle: {
    margin: "0 0 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  docList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  docItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    background: "#ffffff",
    borderRadius: 8,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    textDecoration: "none",
    color: "inherit",
    transition: "background 0.2s",
  },
  docIcon: {
    fontSize: 20,
    flexShrink: 0,
  },
  docContent: {
    flex: 1,
    minWidth: 0,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: "#111827",
  },
  docDescription: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  docMeta: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  docVersion: {
    fontSize: 12,
    color: "#9ca3af",
    background: "#f3f4f6",
    padding: "2px 8px",
    borderRadius: 4,
  },
  docArrow: {
    fontSize: 16,
    color: "#9ca3af",
  },
  footer: {
    background: "#ffffff",
    borderTop: "1px solid #e5e7eb",
    padding: "16px 24px",
  },
  footerContent: {
    maxWidth: 1200,
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
