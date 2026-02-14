"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
