"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Manual {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  iconEmoji: string | null;
  currentVersion: number;
  chapters: Chapter[];
  documents: ManualDocument[];
}

interface Chapter {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  documents: ManualDocument[];
}

interface ManualDocument {
  id: string;
  sortOrder: number;
  displayTitleOverride: string | null;
  systemDocument: {
    id: string;
    code: string;
    title: string;
    category: string;
    currentVersion: { versionNo: number } | null;
  };
}

export default function TenantManualDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: manualId } = React.use(params);
  const router = useRouter();

  const [manual, setManual] = useState<Manual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManual();
  }, [manualId]);

  async function loadManual() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/manuals/${manualId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to load manual");
      }
      const data = await res.json();
      setManual(data);
    } catch (err: any) {
      setError(err.message || "Failed to load manual");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
        Loading manual...
      </div>
    );
  }

  if (error || !manual) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: "#b91c1c" }}>Error</h1>
        <p style={{ color: "#6b7280" }}>{error || "Manual not found"}</p>
        <button
          onClick={() => router.push("/documents/manuals")}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Back to Manuals
        </button>
      </div>
    );
  }

  const totalDocs = manual.documents.length + 
    manual.chapters.reduce((sum, ch) => sum + ch.documents.length, 0);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/documents/manuals" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
          ← Back to Manuals
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 48 }}>{manual.iconEmoji || "📘"}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>{manual.title}</h1>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {manual.code} • Version {manual.currentVersion} • {totalDocs} documents
            </div>
            {manual.description && (
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#4b5563" }}>
                {manual.description}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 999,
              background: manual.status === "PUBLISHED" ? "#dcfce7" : manual.status === "DRAFT" ? "#fef3c7" : "#f3f4f6",
              color: manual.status === "PUBLISHED" ? "#166534" : manual.status === "DRAFT" ? "#92400e" : "#6b7280",
              fontWeight: 600,
            }}
          >
            {manual.status}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Link
          href={`/documents/manuals/${manualId}/preview`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            background: "#2563eb",
            color: "white",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          👁️ Preview & Download
        </Link>
      </div>

      {/* Content Structure */}
      <div style={{ background: "#f9fafb", borderRadius: 8, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Contents</h2>

        {/* Root-level documents */}
        {manual.documents.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {manual.documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "white",
                  borderRadius: 6,
                  marginBottom: 6,
                  border: "1px solid #e5e7eb",
                }}
              >
                <span style={{ fontSize: 16 }}>📄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {doc.displayTitleOverride || doc.systemDocument.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {doc.systemDocument.code} • Rev {doc.systemDocument.currentVersion?.versionNo || 1}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chapters */}
        {manual.chapters.map((chapter) => (
          <div key={chapter.id} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: "#e5e7eb",
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>📁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{chapter.title}</div>
                {chapter.description && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{chapter.description}</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {chapter.documents.length} docs
              </span>
            </div>

            {/* Chapter documents */}
            <div style={{ marginLeft: 20 }}>
              {chapter.documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "white",
                    borderRadius: 6,
                    marginBottom: 6,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <span style={{ fontSize: 16 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {doc.displayTitleOverride || doc.systemDocument.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {doc.systemDocument.code} • Rev {doc.systemDocument.currentVersion?.versionNo || 1}
                    </div>
                  </div>
                </div>
              ))}
              {chapter.documents.length === 0 && (
                <div style={{ padding: 12, color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
                  No documents in this chapter
                </div>
              )}
            </div>
          </div>
        ))}

        {manual.chapters.length === 0 && manual.documents.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>
            <p>This manual has no documents yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
