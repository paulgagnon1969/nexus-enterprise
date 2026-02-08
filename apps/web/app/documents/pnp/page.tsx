"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

interface PnpDocument {
  id: string;
  code: string;
  title: string;
  category: string;
  description: string | null;
  reviewStatus: string;
  active: boolean;
  createdAt: string;
}

export default function PnpListPage() {
  const [documents, setDocuments] = useState<PnpDocument[]>([]);
  const [pending, setPending] = useState<PnpDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocuments() {
      try {
        // Load all documents
        const docsRes = await fetch("/api/pnp");
        if (!docsRes.ok) throw new Error(`Failed to load documents: ${docsRes.statusText}`);
        const docsData = await docsRes.json();
        setDocuments(docsData);

        // Load pending documents
        const pendingRes = await fetch("/api/pnp/pending");
        if (!pendingRes.ok) throw new Error(`Failed to load pending: ${pendingRes.statusText}`);
        const pendingData = await pendingRes.json();
        setPending(pendingData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, []);

  if (loading) {
    return (
      <PageCard>
        <div>Loading...</div>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <div style={{ color: "#dc2626" }}>Error: {error}</div>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <header>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Policies & Procedures</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
            Internal knowledge base articles, SOPs, and procedures.
          </p>
        </header>

        {/* Pending Review */}
        {pending.length > 0 && (
          <section>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              📋 Pending Review ({pending.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pending.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/pnp/${doc.id}`}
                  style={{
                    border: "1px solid #fbbf24",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fffbeb",
                    textDecoration: "none",
                    color: "#111827",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{doc.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {doc.description || "No description"}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        background: "#fbbf24",
                        color: "#78350f",
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      {doc.reviewStatus}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                    Category: {doc.category} • Code: {doc.code}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Approved Documents */}
        <section>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            ✅ Published Documents ({documents.length})
          </h3>
          {documents.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
              No published documents yet. Approve documents from the "Pending Review" section above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/pnp/${doc.id}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    background: "#ffffff",
                    textDecoration: "none",
                    color: "#111827",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{doc.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {doc.description || "No description"}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        background: "#10b981",
                        color: "#ffffff",
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      {doc.reviewStatus}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                    Category: {doc.category} • Code: {doc.code}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageCard>
  );
}
