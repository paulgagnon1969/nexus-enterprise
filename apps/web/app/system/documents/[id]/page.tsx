"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocumentVersion {
  id: string;
  versionNo: number;
  htmlContent: string;
  notes: string | null;
  createdAt: string;
  createdByUserId: string;
}

interface Publication {
  id: string;
  targetType: "ALL_TENANTS" | "SINGLE_TENANT";
  targetCompany: { id: string; name: string } | null;
  publishedAt: string;
  retractedAt: string | null;
  systemDocumentVersion: { versionNo: number };
}

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  active: boolean;
  currentVersion: SystemDocumentVersion | null;
  versions: SystemDocumentVersion[];
  publications: Publication[];
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
}

interface Company {
  id: string;
  name: string;
}

export default function SystemDocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [document, setDocument] = useState<SystemDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<any> | null>(null);

  // Publish modal
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishTarget, setPublishTarget] = useState<"ALL_TENANTS" | "SINGLE_TENANT">("ALL_TENANTS");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (id) {
      loadDocument();
      loadCompanies();
    }
  }, [id]);

  // Dynamically import RichTextEditor
  useEffect(() => {
    import("../../../components/RichTextEditor").then((mod) => {
      setEditorComponent(() => mod.RichTextEditor);
    });
  }, []);

  async function loadDocument() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load document");
      const data = await res.json();
      setDocument(data);
    } catch (err: any) {
      setError(err.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanies() {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : data.companies || []);
      }
    } catch {
      // Ignore - companies list is optional
    }
  }

  function startEditing() {
    if (!document) return;
    setEditTitle(document.title);
    setEditDescription(document.description || "");
    setEditCategory(document.category || "");
    setEditContent(document.currentVersion?.htmlContent || "");
    setEditNotes("");
    setEditing(true);
  }

  async function handleSave() {
    if (!document || !editContent.trim()) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || undefined,
          category: editCategory.trim() || undefined,
          htmlContent: editContent,
          notes: editNotes.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setEditing(false);
      loadDocument();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (publishTarget === "SINGLE_TENANT" && !selectedCompanyId) {
      alert("Please select a company");
      return;
    }

    setPublishing(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType: publishTarget,
          targetCompanyId: publishTarget === "SINGLE_TENANT" ? selectedCompanyId : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to publish");

      setShowPublishModal(false);
      loadDocument();
    } catch (err: any) {
      alert(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetract(publicationId: string) {
    if (!confirm("Retract this publication? Tenants will no longer see this document.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/publications/${publicationId}/retract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to retract");
      loadDocument();
    } catch (err: any) {
      alert(err.message || "Failed to retract");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this document? This will deactivate it and hide it from the list.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/system-documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete");
      router.push("/system/documents");
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading...</div>;
  }

  if (error || !document) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 16 }}>{error || "Document not found"}</div>
        <Link href="/system/documents" style={{ color: "#2563eb" }}>← Back to documents</Link>
      </div>
    );
  }

  const activePublications = document.publications.filter((p) => !p.retractedAt);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/system/documents" style={{ color: "#2563eb", fontSize: 13 }}>← Back to documents</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>
            {document.code}: {document.title}
          </h1>
          {document.description && (
            <div style={{ color: "#6b7280", marginTop: 4 }}>{document.description}</div>
          )}
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
            Created by: {document.createdBy.firstName} {document.createdBy.lastName} ({document.createdBy.email})
            {document.category && <span> · Category: {document.category}</span>}
            · Version: {document.currentVersion?.versionNo || 0}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!editing && (
            <>
              <button
                onClick={startEditing}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
              <button
                onClick={() => setShowPublishModal(true)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Publish
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Title</span>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Description</span>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Category</span>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Content</span>
              {EditorComponent ? (
                <EditorComponent content={editContent} onChange={setEditContent} />
              ) : (
                <div style={{ padding: 16, color: "#9ca3af", border: "1px solid #d1d5db", borderRadius: 6 }}>
                  Loading editor...
                </div>
              )}
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Revision Notes</span>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="What changed in this version?"
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setEditing(false)}
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
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Content Preview */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>Content Preview</h3>
            <div
              style={{ fontSize: 14, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: document.currentVersion?.htmlContent || "<em>No content</em>" }}
            />
          </div>

          {/* Publications */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
              Active Publications ({activePublications.length})
            </h3>
            {activePublications.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Not published yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activePublications.map((pub) => (
                  <div
                    key={pub.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 8,
                      background: "#f9fafb",
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      {pub.targetType === "ALL_TENANTS" ? (
                        <span style={{ fontWeight: 500 }}>All Tenants</span>
                      ) : (
                        <span>{pub.targetCompany?.name || "Unknown company"}</span>
                      )}
                      <span style={{ color: "#9ca3af", marginLeft: 8 }}>
                        v{pub.systemDocumentVersion.versionNo} · {new Date(pub.publishedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRetract(pub.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #fca5a5",
                        background: "white",
                        color: "#b91c1c",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Retract
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Version History */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
              Version History ({document.versions.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {document.versions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    padding: 8,
                    background: v.id === document.currentVersion?.id ? "#eff6ff" : "#f9fafb",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      <strong>v{v.versionNo}</strong>
                      {v.id === document.currentVersion?.id && (
                        <span style={{ color: "#2563eb", marginLeft: 8 }}>(current)</span>
                      )}
                    </span>
                    <span style={{ color: "#9ca3af" }}>{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                  {v.notes && <div style={{ color: "#6b7280", marginTop: 4 }}>{v.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Publish Modal */}
      {showPublishModal && (
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
          onClick={() => setShowPublishModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Publish Document</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  checked={publishTarget === "ALL_TENANTS"}
                  onChange={() => setPublishTarget("ALL_TENANTS")}
                />
                <span>All Tenants</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  checked={publishTarget === "SINGLE_TENANT"}
                  onChange={() => setPublishTarget("SINGLE_TENANT")}
                />
                <span>Single Tenant</span>
              </label>
              {publishTarget === "SINGLE_TENANT" && (
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  style={{ padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                >
                  <option value="">Select company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowPublishModal(false)}
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
                onClick={handlePublish}
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
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
