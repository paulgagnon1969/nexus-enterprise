"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface InboxDocument {
  id: string;
  title: string;
  status: string;
  sourceVersionNo: number;
  copiedAt: string;
  hasNewerSystemVersion: boolean;
  internalNotes: string | null;
  sourceSystemDocument: {
    id: string;
    code: string;
    title: string;
    category: string | null;
    currentVersion: { versionNo: number } | null;
  };
  copiedBy: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  currentVersion: { versionNo: number; htmlContent: string; createdAt: string } | null;
}

interface InboxManual {
  id: string;
  title: string;
  status: string;
  sourceManualVersion: number;
  receivedAt: string;
  hasNewerSourceVersion: boolean;
  internalNotes: string | null;
  sourceManual: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    iconEmoji: string | null;
    currentVersion: number;
  };
  receivedBy: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

interface InboxStats {
  unreleased: number;
  unreleasedDocuments: number;
  unreleasedManuals: number;
  published: number;
  publishedDocuments: number;
  publishedManuals: number;
  updatesPending: number;
}

type TabType = "inbox" | "published";

export default function TenantDocumentsInboxPage() {
  const [activeTab, setActiveTab] = useState<TabType>("inbox");
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [manuals, setManuals] = useState<InboxManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<InboxDocument | null>(null);
  const [previewManual, setPreviewManual] = useState<InboxManual | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNotes, setPublishNotes] = useState("");

  useEffect(() => {
    loadStats();
    loadData();
  }, [activeTab]);

  async function loadStats() {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/documents/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Failed to load stats", err);
    }
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const endpoint = activeTab === "inbox" ? "inbox" : "published";
      const res = await fetch(`${API_BASE}/tenant/documents/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load data");
      const data = await res.json();
      setDocuments(data.documents || []);
      setManuals(data.manuals || []);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocumentDetail(id: string) {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load document");
      const data = await res.json();
      setPreviewDoc(data);
      setPublishNotes("");
    } catch (err: any) {
      alert(err.message || "Failed to load document");
    }
  }

  async function loadManualDetail(id: string) {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/manuals/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load manual");
      const data = await res.json();
      setPreviewManual(data);
      setPublishNotes("");
    } catch (err: any) {
      alert(err.message || "Failed to load manual");
    }
  }

  async function handlePublishDocument() {
    if (!previewDoc) return;
    setPublishing(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/documents/${previewDoc.id}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ internalNotes: publishNotes || undefined }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      setPreviewDoc(null);
      loadStats();
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function handlePublishManual() {
    if (!previewManual) return;
    setPublishing(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/manuals/${previewManual.id}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ internalNotes: publishNotes || undefined }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      setPreviewManual(null);
      loadStats();
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchiveDocument(id: string) {
    if (!confirm("Archive this document? It will be hidden from your organization.")) return;
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/documents/${id}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to archive");
      loadStats();
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to archive");
    }
  }

  async function handleArchiveManual(id: string) {
    if (!confirm("Archive this manual? It will be hidden from your organization.")) return;
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/manuals/${id}/archive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive");
      loadStats();
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to archive");
    }
  }

  const getUserName = (user: { firstName: string | null; lastName: string | null; email: string } | null) => {
    if (!user) return "System";
    if (user.firstName || user.lastName) return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return user.email;
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>📥 Document Inbox</h1>
          <p style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
            Review and publish documents from NEXUS to your organization
          </p>
        </div>
        <Link
          href="/documents"
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "white",
            color: "#374151",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ← Documents Home
        </Link>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: "12px 16px", background: "#fef3c7", borderRadius: 8, flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#92400e" }}>{stats.unreleased}</div>
            <div style={{ fontSize: 12, color: "#92400e" }}>Awaiting Review</div>
          </div>
          <div style={{ padding: "12px 16px", background: "#dcfce7", borderRadius: 8, flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#166534" }}>{stats.published}</div>
            <div style={{ fontSize: 12, color: "#166534" }}>Published</div>
          </div>
          {stats.updatesPending > 0 && (
            <div style={{ padding: "12px 16px", background: "#dbeafe", borderRadius: 8, flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#1e40af" }}>{stats.updatesPending}</div>
              <div style={{ fontSize: 12, color: "#1e40af" }}>Updates Available</div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab("inbox")}
          style={{
            padding: "8px 16px",
            borderRadius: "4px 4px 0 0",
            border: "1px solid #e5e7eb",
            borderBottom: activeTab === "inbox" ? "1px solid white" : "1px solid #e5e7eb",
            background: activeTab === "inbox" ? "white" : "#f9fafb",
            fontWeight: activeTab === "inbox" ? 600 : 400,
            cursor: "pointer",
            marginBottom: -1,
            position: "relative",
            zIndex: activeTab === "inbox" ? 1 : 0,
          }}
        >
          📬 Inbox {stats && stats.unreleased > 0 && <span style={{ color: "#f59e0b" }}>({stats.unreleased})</span>}
        </button>
        <button
          onClick={() => setActiveTab("published")}
          style={{
            padding: "8px 16px",
            borderRadius: "4px 4px 0 0",
            border: "1px solid #e5e7eb",
            borderBottom: activeTab === "published" ? "1px solid white" : "1px solid #e5e7eb",
            background: activeTab === "published" ? "white" : "#f9fafb",
            fontWeight: activeTab === "published" ? 600 : 400,
            cursor: "pointer",
            marginBottom: -1,
            position: "relative",
            zIndex: activeTab === "published" ? 1 : 0,
          }}
        >
          ✅ Published {stats && <span style={{ color: "#6b7280" }}>({stats.published})</span>}
        </button>
      </div>

      {/* Content */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 8px 8px 8px", background: "white", padding: 16 }}>
        {error && (
          <div style={{ color: "#b91c1c", marginBottom: 16, padding: 12, background: "#fef2f2", borderRadius: 4 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>Loading...</div>
        ) : documents.length === 0 && manuals.length === 0 ? (
          <div style={{ padding: 24, color: "#6b7280", textAlign: "center", background: "#f9fafb", borderRadius: 8 }}>
            {activeTab === "inbox"
              ? "No documents waiting for review. Check back later!"
              : "No published documents yet. Review and publish items from your inbox."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Documents */}
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📄</span>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{doc.title}</span>
                    {doc.hasNewerSystemVersion && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#dbeafe",
                          color: "#1e40af",
                          fontSize: 10,
                        }}
                      >
                        Update available
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    Source: {doc.sourceSystemDocument.code} · v{doc.sourceVersionNo}
                    {doc.sourceSystemDocument.category && ` · ${doc.sourceSystemDocument.category}`}
                    {activeTab === "inbox" && ` · Received ${new Date(doc.copiedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => loadDocumentDetail(doc.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Preview
                  </button>
                  {activeTab === "inbox" ? (
                    <button
                      onClick={() => loadDocumentDetail(doc.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "none",
                        background: "#2563eb",
                        color: "white",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Review & Publish
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchiveDocument(doc.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#991b1b",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Manuals */}
            {manuals.map((manual) => (
              <div
                key={manual.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{manual.sourceManual.iconEmoji || "📚"}</span>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{manual.title}</span>
                    {manual.hasNewerSourceVersion && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#dbeafe",
                          color: "#1e40af",
                          fontSize: 10,
                        }}
                      >
                        Update available
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    Source: {manual.sourceManual.code} · v{manual.sourceManualVersion}
                    {manual.sourceManual.description && ` · ${manual.sourceManual.description.slice(0, 50)}...`}
                    {activeTab === "inbox" && ` · Received ${new Date(manual.receivedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => loadManualDetail(manual.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Preview
                  </button>
                  {activeTab === "inbox" ? (
                    <button
                      onClick={() => loadManualDetail(manual.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "none",
                        background: "#2563eb",
                        color: "white",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Review & Publish
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchiveManual(manual.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#991b1b",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
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
          onClick={() => setPreviewDoc(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              width: "90%",
              maxWidth: 800,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 20, borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{previewDoc.title}</h2>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    From: {previewDoc.sourceSystemDocument.code} · v{previewDoc.sourceVersionNo}
                    {previewDoc.sourceSystemDocument.category && ` · ${previewDoc.sourceSystemDocument.category}`}
                  </div>
                </div>
                <button
                  onClick={() => setPreviewDoc(null)}
                  style={{
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    fontSize: 20,
                    cursor: "pointer",
                    color: "#6b7280",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: 20 }}>
              <div
                style={{
                  padding: 16,
                  background: "#f9fafb",
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.6,
                  maxHeight: 400,
                  overflow: "auto",
                }}
                dangerouslySetInnerHTML={{ __html: previewDoc.currentVersion?.htmlContent || "<em>No content</em>" }}
              />
            </div>

            {previewDoc.status === "UNRELEASED" && (
              <div style={{ padding: 20, borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Internal Notes (optional)
                  </span>
                  <textarea
                    value={publishNotes}
                    onChange={(e) => setPublishNotes(e.target.value)}
                    placeholder="Add notes for your team..."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      resize: "vertical",
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setPreviewDoc(null)}
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
                    onClick={handlePublishDocument}
                    disabled={publishing}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 4,
                      border: "none",
                      background: "#16a34a",
                      color: "white",
                      cursor: publishing ? "default" : "pointer",
                      opacity: publishing ? 0.7 : 1,
                    }}
                  >
                    {publishing ? "Publishing..." : "✓ Publish to Organization"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Preview Modal */}
      {previewManual && (
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
          onClick={() => setPreviewManual(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              width: "90%",
              maxWidth: 800,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 20, borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{previewManual.sourceManual.iconEmoji || "📚"}</span>
                    {previewManual.title}
                  </h2>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    From: {previewManual.sourceManual.code} · v{previewManual.sourceManualVersion}
                  </div>
                </div>
                <button
                  onClick={() => setPreviewManual(null)}
                  style={{
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    fontSize: 20,
                    cursor: "pointer",
                    color: "#6b7280",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: 20 }}>
              {previewManual.sourceManual.description && (
                <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
                  {previewManual.sourceManual.description}
                </p>
              )}
              <div style={{ padding: 16, background: "#f9fafb", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>
                This manual contains documents and chapters from NEXUS.
                Publishing will make it available to your organization's members.
              </div>
            </div>

            {previewManual.status === "UNRELEASED" && (
              <div style={{ padding: 20, borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Internal Notes (optional)
                  </span>
                  <textarea
                    value={publishNotes}
                    onChange={(e) => setPublishNotes(e.target.value)}
                    placeholder="Add notes for your team..."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      resize: "vertical",
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setPreviewManual(null)}
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
                    onClick={handlePublishManual}
                    disabled={publishing}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 4,
                      border: "none",
                      background: "#16a34a",
                      color: "white",
                      cursor: publishing ? "default" : "pointer",
                      opacity: publishing ? 0.7 : 1,
                    }}
                  >
                    {publishing ? "Publishing..." : "✓ Publish to Organization"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
