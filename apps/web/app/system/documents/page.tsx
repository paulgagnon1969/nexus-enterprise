"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    versionNo: number;
    createdAt: string;
  } | null;
  _count: {
    publications: number;
    tenantCopies: number;
  };
}

export default function SystemDocumentsPage() {
  const [documents, setDocuments] = useState<SystemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Create new document form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [showInactive]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const url = `${API_BASE}/system-documents${showInactive ? "?includeInactive=true" : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      setError(err.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newTitle.trim() || !newContent.trim()) return;

    setCreating(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newCode.trim(),
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          category: newCategory.trim() || undefined,
          htmlContent: newContent,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create document");
      }

      // Reset form and reload
      setNewCode("");
      setNewTitle("");
      setNewDescription("");
      setNewCategory("");
      setNewContent("");
      setShowCreateForm(false);
      loadDocuments();
    } catch (err: any) {
      alert(err.message || "Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>NEXUS System Documents</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: "#2563eb",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + New Document
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {showCreateForm && (
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
          onClick={() => setShowCreateForm(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Create System Document</h2>
            <form onSubmit={handleCreate}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Code *</span>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g., SOP-001"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                    required
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Title *</span>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Document title"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                    required
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Description</span>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Category</span>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g., Safety, HR, Operations"
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Content (HTML) *</span>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="<h1>Document Title</h1><p>Content...</p>"
                    rows={8}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db", fontFamily: "monospace", fontSize: 12 }}
                    required
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
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
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    cursor: creating ? "default" : "pointer",
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading...</div>
      ) : documents.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No system documents yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/system/documents/${doc.id}`}
              style={{
                display: "block",
                padding: 16,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: doc.active ? "white" : "#f9fafb",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{doc.code}</span>
                    <span style={{ fontSize: 14 }}>{doc.title}</span>
                    {!doc.active && (
                      <span style={{ fontSize: 11, background: "#fee2e2", color: "#b91c1c", padding: "2px 6px", borderRadius: 4 }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {doc.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{doc.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, display: "flex", gap: 12 }}>
                    {doc.category && <span>Category: {doc.category}</span>}
                    <span>Version: {doc.currentVersion?.versionNo || 0}</span>
                    <span>Publications: {doc._count.publications}</span>
                    <span>Tenant Copies: {doc._count.tenantCopies}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Updated: {new Date(doc.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
