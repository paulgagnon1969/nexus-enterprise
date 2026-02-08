"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

interface PnpDocument {
  id: string;
  code: string;
  title: string;
  category: string;
  description: string | null;
  reviewStatus: string;
  active: boolean;
  currentVersion: {
    versionNo: number;
    versionLabel: string | null;
  } | null;
}

export default function PnpDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const [document, setDocument] = useState<PnpDocument | null>(null);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const id = params.id as string;

  useEffect(() => {
    async function loadDocument() {
      try {
        // Load document metadata
        const docRes = await fetch(`/api/pnp/${id}`);
        if (!docRes.ok) throw new Error(`Failed to load document: ${docRes.statusText}`);
        const docData = await docRes.json();
        setDocument(docData);

        // Load rendered HTML
        const htmlRes = await fetch(`/api/pnp/${id}/rendered`);
        if (!htmlRes.ok) throw new Error(`Failed to load HTML: ${htmlRes.statusText}`);
        const htmlData = await htmlRes.json();
        setHtml(htmlData.html || "");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDocument();
  }, [id]);

  async function handleApprove() {
    if (!confirm("Approve this document?")) return;

    setApproving(true);
    try {
      const res = await fetch(`/api/pnp/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Approved via web UI" }),
      });

      if (!res.ok) throw new Error(`Failed to approve: ${res.statusText}`);

      alert("Document approved!");
      router.push("/documents/pnp");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <PageCard>
        <div>Loading...</div>
      </PageCard>
    );
  }

  if (error || !document) {
    return (
      <PageCard>
        <div style={{ color: "#dc2626" }}>Error: {error || "Document not found"}</div>
        <button
          onClick={() => router.push("/documents/pnp")}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          ← Back to List
        </button>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{document.title}</h2>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {document.description || "No description"}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
              Category: {document.category} • Code: {document.code} •{" "}
              {document.currentVersion
                ? `Version ${document.currentVersion.versionNo}`
                : "No version"}
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              padding: "6px 12px",
              background:
                document.reviewStatus === "PENDING_REVIEW"
                  ? "#fbbf24"
                  : document.reviewStatus === "APPROVED"
                  ? "#10b981"
                  : "#6b7280",
              color: document.reviewStatus === "PENDING_REVIEW" ? "#78350f" : "#ffffff",
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            {document.reviewStatus}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/documents/pnp")}
            style={{
              padding: "8px 16px",
              background: "#f3f4f6",
              color: "#111827",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back to List
          </button>

          {document.reviewStatus === "PENDING_REVIEW" && (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{
                padding: "8px 16px",
                background: "#10b981",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: approving ? "not-allowed" : "pointer",
                fontSize: 13,
                opacity: approving ? 0.6 : 1,
              }}
            >
              {approving ? "Approving..." : "✓ Approve Document"}
            </button>
          )}
        </div>

        {/* Document Content */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 24,
            background: "#ffffff",
            minHeight: 400,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </PageCard>
  );
}
