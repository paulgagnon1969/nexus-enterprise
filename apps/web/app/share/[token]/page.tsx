"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SharedContent {
  type: "document" | "manual";
  id: string;
  code: string;
  title: string;
  description: string | null;
  category?: string | null;
  versionNo?: number;
  version?: number;
  htmlContent?: string;
  iconEmoji?: string | null;
  coverImageUrl?: string | null;
  chapters?: {
    id: string;
    title: string;
    description: string | null;
    documents: {
      id: string;
      title: string;
      code: string;
      versionNo: number;
      htmlContent: string;
    }[];
  }[];
  rootDocuments?: {
    id: string;
    title: string;
    code: string;
    versionNo: number;
    htmlContent: string;
  }[];
  updatedAt?: string;
  _shareContext?: {
    recipientName: string | null;
    recipientEmail: string | null;
    serialNumber: string;
    accessedAt: string;
  };
}

export default function ShareLinkPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const urlPasscode = searchParams?.get("passcode");

  const [content, setContent] = useState<SharedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [needsEmailAuth, setNeedsEmailAuth] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authCredentials, setAuthCredentials] = useState<{ email: string; password: string } | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // For manual navigation
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (urlPasscode) {
      loadContent(urlPasscode);
    } else {
      loadContent();
    }
  }, [token, urlPasscode]);

  // IP protection: block copy, print, right-click, keyboard shortcuts
  useEffect(() => {
    if (!content) return;
    const handleContextMenu = (e: Event) => { e.preventDefault(); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "s", "a", "p", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === "PrintScreen") e.preventDefault();
    };
    const handleDragStart = (e: Event) => { e.preventDefault(); };

    // Inject print-blocking CSS
    const printStyle = document.createElement("style");
    printStyle.id = "nexus-print-block";
    printStyle.textContent = `@media print { body * { display: none !important; } body::after { content: "Printing is disabled for this document."; display: block !important; text-align: center; padding: 40px; font-size: 18px; color: #dc2626; } }`;
    document.head.appendChild(printStyle);

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
      const el = document.getElementById("nexus-print-block");
      if (el) el.remove();
    };
  }, [content]);

  async function loadContent(passCodeToUse?: string) {
    setLoading(true);
    setError(null);
    try {
      const url = passCodeToUse
        ? `${API_BASE}/share/${token}?passcode=${encodeURIComponent(passCodeToUse)}`
        : `${API_BASE}/share/${token}`;
      
      const res = await fetch(url);
      
      if (res.status === 404) {
        setError("This share link is invalid or has been revoked.");
        return;
      }
      
      if (res.status === 403) {
        const data = await res.json();
        if (data.message?.includes("passcode")) {
          // Check if this link has recipientEmail set (secure share vs legacy passcode)
          // The API returns "This link requires a passcode" for both - we need to differentiate
          // For secure shares, the link also has recipientEmail, so the verify endpoint is used
          setNeedsPasscode(true);
          setNeedsEmailAuth(true);
          return;
        }
        if (data.message?.includes("expired")) {
          setError("This share link has expired.");
          return;
        }
        setError(data.message || "Access denied");
        return;
      }

      if (!res.ok) throw new Error("Failed to access content");
      
      const data = await res.json();
      setContent(data);
      setNeedsPasscode(false);
    } catch (err: any) {
      setError(err.message || "Failed to access content");
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;
    setSubmitting(true);
    await loadContent(passcode);
  }

  async function handleSecureAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/share/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });

      if (res.status === 403) {
        const data = await res.json();
        if (data.message?.includes("expired")) {
          setError("This share link has expired.");
          setNeedsPasscode(false);
          setNeedsEmailAuth(false);
        } else {
          setError("Invalid email or password. Please try again.");
        }
        return;
      }

      if (res.status === 404) {
        setError("This share link is invalid or has been revoked.");
        setNeedsPasscode(false);
        setNeedsEmailAuth(false);
        return;
      }

      if (!res.ok) throw new Error("Failed to verify credentials");

      const data = await res.json();
      setContent(data);
      setAuthCredentials({ email: authEmail, password: authPassword });
      setNeedsPasscode(false);
      setNeedsEmailAuth(false);
    } catch (err: any) {
      setError(err.message || "Failed to verify credentials");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePdfDownload() {
    if (!authCredentials || !token || pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/share/${token}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authCredentials.email, password: authCredentials.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${content?.title || "document"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("PDF download failed: " + (err.message || "Unknown error"));
    } finally {
      setPdfDownloading(false);
    }
  }

  // Get the currently selected document
  const currentManualDoc = content?.type === "manual" && selectedDoc
    ? [...(content.chapters?.flatMap(c => c.documents) || []), ...(content.rootDocuments || [])].find(d => d.id === selectedDoc)
    : null;

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner} />
          <span>Loading content...</span>
        </div>
      </div>
    );
  }

  if (needsPasscode && needsEmailAuth) {
    return (
      <div style={styles.container}>
        <div style={styles.passcodeBox}>
          <div style={styles.lockIcon}>🔒</div>
          <h1 style={styles.passcodeTitle}>Secure Document Access</h1>
          <p style={styles.passcodeText}>
            Enter the email address this was shared with and the password
            sent to you in a separate email.
          </p>
          {error && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 16,
              color: "#b91c1c",
              fontSize: 13,
            }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSecureAuthSubmit} style={styles.passcodeForm}>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Your email address"
              autoFocus
              style={{ ...styles.passcodeInput, textAlign: "left" }}
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Access password"
              style={styles.passcodeInput}
            />
            <button type="submit" disabled={submitting} style={styles.passcodeButton}>
              {submitting ? "Verifying..." : "Access Document"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (needsPasscode && !needsEmailAuth) {
    return (
      <div style={styles.container}>
        <div style={styles.passcodeBox}>
          <div style={styles.lockIcon}>🔒</div>
          <h1 style={styles.passcodeTitle}>Protected Content</h1>
          <p style={styles.passcodeText}>
            This content is protected. Enter the passcode to continue.
          </p>
          <form onSubmit={handlePasscodeSubmit} style={styles.passcodeForm}>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoFocus
              style={styles.passcodeInput}
            />
            <button type="submit" disabled={submitting} style={styles.passcodeButton}>
              {submitting ? "Verifying..." : "Access Content"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h1 style={styles.errorTitle}>⚠️ Unable to Access</h1>
          <p style={styles.errorText}>{error}</p>
          <Link href="/" style={styles.homeLink}>
            ← Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!content) return null;

  const shareCtx = content._shareContext;

  // Shared header with optional PDF download button
  const renderHeader = (label: React.ReactNode) => (
    <header style={styles.header}>
      <div style={styles.headerContent}>
        <Link href="/" style={styles.logo}>NEXUS</Link>
        <span style={styles.headerDivider}>|</span>
        <span style={styles.headerLabel}>{label}</span>
        {shareCtx && authCredentials && content.type === "manual" && (
          <button
            onClick={handlePdfDownload}
            disabled={pdfDownloading}
            style={styles.pdfButton}
          >
            {pdfDownloading ? "Generating..." : "Download PDF"}
          </button>
        )}
      </div>
    </header>
  );

  return (
    <div
      style={{ ...styles.pageWrapper, userSelect: "none" } as any}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* CONFIDENTIAL banner */}
      {shareCtx && (
        <div style={styles.confidentialBanner}>
          CONFIDENTIAL — Licensed to{" "}
          {shareCtx.recipientName || shareCtx.recipientEmail || "Viewer"} —{" "}
          {shareCtx.serialNumber}
        </div>
      )}

      {content.type === "document" ? (
        <>
          {renderHeader("Shared Document")}
          <main style={styles.main}>
            <article style={styles.article}>
              <div style={styles.docHeader}>
                {content.category && (
                  <div style={styles.breadcrumb}>
                    <span style={styles.breadcrumbItem}>{content.category}</span>
                  </div>
                )}
                <h1 style={styles.title}>{content.title}</h1>
                {content.description && (
                  <p style={styles.description}>{content.description}</p>
                )}
                <div style={styles.meta}>
                  <span>Code: {content.code}</span>
                  <span style={styles.metaDivider}>•</span>
                  <span>Version {content.versionNo}</span>
                </div>
              </div>
              <div
                style={styles.content}
                dangerouslySetInnerHTML={{ __html: content.htmlContent || "" }}
              />
            </article>
          </main>
          <footer style={styles.footer}>
            <div style={styles.footerContent}>
              <span>Shared via NEXUS</span>
            </div>
          </footer>
        </>
      ) : (
        <>
          {renderHeader(
            <>{content.iconEmoji || "\ud83d\udcda"} {content.title}</>
          )}
          <div style={styles.manualLayout}>
            {/* Sidebar TOC */}
            <aside style={styles.sidebar}>
              <div style={styles.sidebarHeader}>
                <h2 style={styles.sidebarTitle}>Table of Contents</h2>
              </div>
              <nav style={styles.tocNav}>
                {content.rootDocuments && content.rootDocuments.length > 0 && (
                  <div style={styles.tocSection}>
                    {content.rootDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc.id)}
                        style={{
                          ...styles.tocItem,
                          ...(selectedDoc === doc.id ? styles.tocItemActive : {}),
                        }}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                )}
                {content.chapters?.map((chapter) => (
                  <div key={chapter.id} style={styles.tocSection}>
                    <div style={styles.tocChapter}>{chapter.title}</div>
                    {chapter.documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc.id)}
                        style={{
                          ...styles.tocItem,
                          ...(selectedDoc === doc.id ? styles.tocItemActive : {}),
                        }}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </aside>

            {/* Main Content */}
            <main style={styles.manualMain}>
              {currentManualDoc ? (
                <article style={styles.article}>
                  <div style={styles.docHeader}>
                    <h1 style={styles.title}>{currentManualDoc.title}</h1>
                    <div style={styles.meta}>
                      <span>Rev {currentManualDoc.versionNo}</span>
                    </div>
                  </div>
                  <div
                    style={styles.content}
                    dangerouslySetInnerHTML={{ __html: currentManualDoc.htmlContent }}
                  />
                </article>
              ) : (
                <div style={styles.manualIntro}>
                  <div style={styles.manualIcon}>{content.iconEmoji || "\ud83d\udcda"}</div>
                  <h1 style={styles.manualTitle}>{content.title}</h1>
                  {content.description && (
                    <p style={styles.manualDescription}>{content.description}</p>
                  )}
                  <p style={styles.manualHint}>
                    Select a document from the table of contents to begin reading.
                  </p>
                </div>
              )}
            </main>
          </div>

          <footer style={styles.footer}>
            <div style={styles.footerContent}>
              <span>Shared via NEXUS</span>
              <span style={styles.footerDivider}>•</span>
              <span>Manual v{content.version}</span>
            </div>
          </footer>
        </>
      )}

      {/* Watermark overlay */}
      {shareCtx && (
        <div style={styles.watermarkOverlay}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute" as const,
                top: `${(i % 5) * 25 - 10}%`,
                left: `${Math.floor(i / 5) * 30 - 10}%`,
                transform: "rotate(-30deg)",
                fontSize: 16,
                color: "rgba(0, 0, 0, 0.04)",
                whiteSpace: "nowrap" as const,
                userSelect: "none" as const,
                pointerEvents: "none" as const,
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {shareCtx.recipientName || shareCtx.recipientEmail || "Viewer"}{" "}
              \u00b7 {shareCtx.serialNumber}
            </div>
          ))}
        </div>
      )}
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
  },
  passcodeBox: {
    textAlign: "center",
    maxWidth: 360,
    padding: 32,
    background: "white",
    borderRadius: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  passcodeTitle: {
    margin: "0 0 8px",
    fontSize: 20,
    color: "#111827",
  },
  passcodeText: {
    margin: "0 0 24px",
    color: "#6b7280",
    fontSize: 14,
  },
  passcodeForm: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  passcodeInput: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 16,
    textAlign: "center",
  },
  passcodeButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
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
  manualLayout: {
    flex: 1,
    display: "flex",
  },
  sidebar: {
    width: 280,
    background: "#ffffff",
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
  },
  sidebarTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
  },
  tocNav: {
    flex: 1,
    overflow: "auto",
    padding: "12px 0",
  },
  tocSection: {
    marginBottom: 8,
  },
  tocChapter: {
    padding: "8px 20px",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tocItem: {
    display: "block",
    width: "100%",
    padding: "8px 20px 8px 28px",
    border: "none",
    background: "none",
    textAlign: "left",
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
  },
  tocItemActive: {
    background: "#eff6ff",
    color: "#2563eb",
    fontWeight: 500,
  },
  manualMain: {
    flex: 1,
    padding: "32px 24px",
    overflow: "auto",
  },
  manualIntro: {
    maxWidth: 600,
    margin: "80px auto",
    textAlign: "center",
  },
  manualIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  manualTitle: {
    margin: "0 0 16px",
    fontSize: 32,
    fontWeight: 700,
    color: "#111827",
  },
  manualDescription: {
    margin: "0 0 24px",
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 1.6,
  },
  manualHint: {
    margin: 0,
    fontSize: 14,
    color: "#9ca3af",
  },
  watermarkOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    zIndex: 9998,
    overflow: "hidden",
  },
  confidentialBanner: {
    background: "#991b1b",
    color: "#ffffff",
    textAlign: "center",
    padding: "6px 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  pdfButton: {
    marginLeft: "auto",
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#374151",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
};
