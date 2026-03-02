"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// --- Search Types ---

interface SearchSnippet {
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchDocMatch {
  id: string;
  code: string;
  title: string;
  source: "copy" | "published";
  category?: string | null;
  snippets: SearchSnippet[];
  matchCount: number;
}

interface SearchGroup {
  category: string;
  documents: SearchDocMatch[];
  totalInGroup: number;
}

interface SearchResults {
  groups: SearchGroup[];
  totalMatches: number;
}

interface PublishedDocument {
  id: string;
  systemDocument: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    category: string | null;
  };
  systemDocumentVersion: {
    id: string;
    versionNo: number;
    htmlContent: string;
  };
  publishedAt: string;
}

export default function TenantSystemDocumentsPage() {
  const [documents, setDocuments] = useState<PublishedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<PublishedDocument | null>(null);
  const [copying, setCopying] = useState(false);

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/system-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyToOrg(publicationId: string) {
    if (!confirm("Copy this document to your organization? You can then edit your own copy.")) return;

    setCopying(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/system-documents/${publicationId}/copy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to copy");
      }

      alert("Document copied to your organization. You can view and edit it in 'My Document Copies'.");
    } catch (err: any) {
      alert(err.message || "Failed to copy");
    } finally {
      setCopying(false);
    }
  }

  // Global search handler with debounce
  const executeSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(
        `${API_BASE}/tenant/documents/search?q=${encodeURIComponent(q.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data: SearchResults = await res.json();
        setSearchResults(data);
      }
    } catch {
      // Non-critical
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!value.trim()) {
        setSearchResults(null);
        return;
      }
      searchTimer.current = setTimeout(() => executeSearch(value), 400);
    },
    [executeSearch],
  );

  // Group documents by category
  const grouped = documents.reduce((acc, doc) => {
    const cat = doc.systemDocument.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, PublishedDocument[]>);

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>NEXUS System Documents</h1>
        <Link
          href="/documents/copies"
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
          My Document Copies →
        </Link>
      </div>

      {/* Global Document Search */}
      <div
        style={{
          marginBottom: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#f8fafc",
        }}
      >
        <div style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>Search Documents</span>
            {searchResults && searchResults.totalMatches > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 8,
                  backgroundColor: "#dbeafe",
                  color: "#1e40af",
                  fontWeight: 500,
                }}
              >
                {searchResults.totalMatches} match{searchResults.totalMatches !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search all document content, titles, tags…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                fontSize: 13,
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                backgroundColor: "#ffffff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                color: "#94a3b8",
                pointerEvents: "none",
              }}
            >
              🔎
            </span>
            {searchLoading && (
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  border: "2px solid #3b82f6",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
            )}
          </div>

          {/* Search Results */}
          {searchQuery.trim().length >= 2 && searchResults && (
            <div style={{ marginTop: 12 }}>
              {searchResults.totalMatches === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0, textAlign: "center", padding: 8 }}>
                  No documents match "{searchQuery.trim()}"
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto" }}>
                  {searchResults.groups.map((group) => (
                    <div key={group.category}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 6,
                          paddingBottom: 4,
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {group.category} ({group.totalInGroup})
                      </div>
                      {group.documents.map((doc) => (
                        <div
                          key={doc.id}
                          style={{
                            padding: "8px 10px",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            marginBottom: 4,
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            // Find the corresponding published doc and select it
                            const pub = documents.find(
                              (d) => d.systemDocument.id === doc.id || d.id === doc.id
                            );
                            if (pub) setSelectedDoc(pub);
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                              {doc.title}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                padding: "1px 5px",
                                borderRadius: 3,
                                backgroundColor: doc.source === "copy" ? "#dcfce7" : "#f1f5f9",
                                color: doc.source === "copy" ? "#166534" : "#64748b",
                                fontWeight: 500,
                              }}
                            >
                              {doc.source === "copy" ? "My Copy" : doc.code}
                            </span>
                          </div>
                          {doc.snippets.map((snippet, sIdx) => (
                            <div
                              key={sIdx}
                              style={{
                                fontSize: 11,
                                lineHeight: 1.5,
                                color: "#475569",
                                padding: "3px 6px",
                                backgroundColor: "#f8fafc",
                                borderRadius: 3,
                                marginTop: 3,
                                borderLeft: "2px solid #3b82f6",
                                wordBreak: "break-word",
                              }}
                            >
                              <span style={{ color: "#94a3b8" }}>
                                {snippet.text.slice(0, snippet.matchStart)}
                              </span>
                              <mark
                                style={{
                                  backgroundColor: "#fef08a",
                                  color: "#1e293b",
                                  padding: "0px 1px",
                                  borderRadius: 2,
                                  fontWeight: 600,
                                }}
                              >
                                {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
                              </mark>
                              <span style={{ color: "#94a3b8" }}>
                                {snippet.text.slice(snippet.matchEnd)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 16, padding: 12, background: "#fef2f2", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <div style={{ color: "#6b7280", padding: 24, textAlign: "center", background: "#f9fafb", borderRadius: 8 }}>
          No system documents have been published to your organization yet.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24 }}>
          {/* Document List */}
          <div style={{ flex: "0 0 300px" }}>
            {Object.entries(grouped).map(([category, docs]) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>
                  {category}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {docs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 4,
                        border: "1px solid",
                        borderColor: selectedDoc?.id === doc.id ? "#2563eb" : "#e5e7eb",
                        background: selectedDoc?.id === doc.id ? "#eff6ff" : "white",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {doc.systemDocument.code}: {doc.systemDocument.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        v{doc.systemDocumentVersion.versionNo}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Document Viewer */}
          <div style={{ flex: 1 }}>
            {selectedDoc ? (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>
                      {selectedDoc.systemDocument.code}: {selectedDoc.systemDocument.title}
                    </h2>
                    {selectedDoc.systemDocument.description && (
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                        {selectedDoc.systemDocument.description}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                      Version {selectedDoc.systemDocumentVersion.versionNo} · Published {new Date(selectedDoc.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyToOrg(selectedDoc.id)}
                    disabled={copying}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "none",
                      background: "#2563eb",
                      color: "white",
                      fontSize: 13,
                      cursor: copying ? "default" : "pointer",
                      opacity: copying ? 0.7 : 1,
                    }}
                  >
                    {copying ? "Copying..." : "Copy to My Org"}
                  </button>
                </div>
                <div
                  style={{
                    padding: 16,
                    background: "#f9fafb",
                    borderRadius: 4,
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                  dangerouslySetInnerHTML={{ __html: selectedDoc.systemDocumentVersion.htmlContent }}
                />
              </div>
            ) : (
              <div style={{ color: "#9ca3af", padding: 24, textAlign: "center", background: "#f9fafb", borderRadius: 8 }}>
                Select a document to view its contents
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
