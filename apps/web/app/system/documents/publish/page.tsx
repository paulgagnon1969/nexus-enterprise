"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageCard } from "../../../ui-shell";
import { TenantPublishModal } from "../components/TenantPublishModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  description?: string;
  category?: string;
  active: boolean;
  currentVersion?: {
    versionNo: number;
    createdAt: string;
  };
  _count: {
    publications: number;
    tenantCopies: number;
  };
}

interface Publication {
  id: string;
  targetType: "ALL_TENANTS" | "SINGLE_TENANT";
  targetCompany?: { id: string; name: string };
  publishedAt: string;
  retractedAt?: string;
  systemDocumentVersion: { versionNo: number };
}

export default function PublishToTenantsPage() {
  const [documents, setDocuments] = useState<SystemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Publish modal state
  const [publishModal, setPublishModal] = useState<{ doc: SystemDocument } | null>(null);

  // View publications modal
  const [viewPublications, setViewPublications] = useState<{ doc: SystemDocument; publications: Publication[] } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system-documents`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.filter((d: SystemDocument) => d.active));
    } catch (err: any) {
      setError(err?.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const loadPublications = async (doc: SystemDocument) => {
    try {
      const res = await fetch(`${API_BASE}/system-documents/${doc.id}/publications`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setViewPublications({ doc, publications: data });
      }
    } catch {
      alert("Failed to load publications");
    }
  };

  if (loading) {
    return (
      <PageCard>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading documents...</p>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/system/documents" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
              ← Documents
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>🚀 Publish to Tenants</h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: "#6b7280" }}>
            Push system documents to tenant organizations. Published documents appear in tenant inboxes.
          </p>
        </header>

        {error && (
          <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 6 }}>
            {error}
          </div>
        )}

        {/* Documents List */}
        {documents.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280", background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>No system documents</div>
            <div style={{ fontSize: 14 }}>Create documents in the System Documents Library first.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  padding: 16,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{doc.code}</span>
                    <span style={{ fontSize: 14 }}>{doc.title}</span>
                    {doc.currentVersion && (
                      <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
                        v{doc.currentVersion.versionNo}
                      </span>
                    )}
                  </div>
                  {doc.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{doc.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, display: "flex", gap: 12 }}>
                    <span>{doc._count.publications} publication(s)</span>
                    <span>{doc._count.tenantCopies} tenant copies</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {doc._count.publications > 0 && (
                    <button
                      type="button"
                      onClick={() => loadPublications(doc)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      View Publications
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPublishModal({ doc })}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 4,
                      border: "none",
                      background: "#2563eb",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    Publish
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {publishModal && (
        <TenantPublishModal
          documentId={publishModal.doc.id}
          documentCode={publishModal.doc.code}
          documentTitle={publishModal.doc.title}
          onClose={() => setPublishModal(null)}
          onSuccess={loadDocuments}
        />
      )}

      {/* View Publications Modal */}
      {viewPublications && (
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
          onClick={() => setViewPublications(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 560,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
              Publications for {viewPublications.doc.code}
            </h2>

            {viewPublications.publications.length === 0 ? (
              <p style={{ color: "#6b7280" }}>No active publications.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {viewPublications.publications.map((pub) => (
                  <div
                    key={pub.id}
                    style={{
                      padding: 12,
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      background: pub.retractedAt ? "#f9fafb" : "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 14 }}>
                          {pub.targetType === "ALL_TENANTS" ? "All Tenants" : pub.targetCompany?.name || "Single Tenant"}
                        </span>
                        <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
                          v{pub.systemDocumentVersion.versionNo}
                        </span>
                      </div>
                      {pub.retractedAt && (
                        <span style={{ fontSize: 11, color: "#b91c1c", background: "#fee2e2", padding: "2px 6px", borderRadius: 4 }}>
                          Retracted
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                      Published: {new Date(pub.publishedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setViewPublications(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}
