"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface DocumentCopy {
  id: string;
  title: string;
  description: string | null;
  hasNewerSystemVersion: boolean;
  currentVersion: {
    id: string;
    versionNo: number;
    htmlContent: string;
    notes: string | null;
    createdAt: string;
  } | null;
  versions: {
    id: string;
    versionNo: number;
    notes: string | null;
    createdAt: string;
  }[];
  sourcePublication: {
    id: string;
    systemDocument: {
      id: string;
      code: string;
      title: string;
    };
    systemDocumentVersion: {
      versionNo: number;
    };
  };
  createdAt: string;
}

export default function TenantDocumentCopiesPage() {
  const [copies, setCopies] = useState<DocumentCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCopy, setSelectedCopy] = useState<DocumentCopy | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<any> | null>(null);

  // Version history modal
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    loadCopies();
  }, []);

  // Dynamically import RichTextEditor
  useEffect(() => {
    import("../../components/RichTextEditor").then((mod) => {
      setEditorComponent(() => mod.RichTextEditor);
    });
  }, []);

  async function loadCopies() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/document-copies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load copies");
      const data = await res.json();
      setCopies(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load copies");
    } finally {
      setLoading(false);
    }
  }

  async function loadCopyDetail(id: string) {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/document-copies/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load copy");
      const data = await res.json();
      setSelectedCopy(data);
    } catch (err: any) {
      alert(err.message || "Failed to load copy");
    }
  }

  function startEditing() {
    if (!selectedCopy) return;
    setEditTitle(selectedCopy.title);
    setEditContent(selectedCopy.currentVersion?.htmlContent || "");
    setEditNotes("");
    setEditing(true);
  }

  async function handleSave() {
    if (!selectedCopy || !editContent.trim()) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/document-copies/${selectedCopy.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          htmlContent: editContent,
          notes: editNotes.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setEditing(false);
      loadCopyDetail(selectedCopy.id);
      loadCopies();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRollback(versionId: string) {
    if (!selectedCopy) return;
    if (!confirm("Rollback to this version? Your current content will be replaced.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/document-copies/${selectedCopy.id}/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ versionId }),
      });

      if (!res.ok) throw new Error("Failed to rollback");

      setShowVersions(false);
      loadCopyDetail(selectedCopy.id);
      loadCopies();
    } catch (err: any) {
      alert(err.message || "Failed to rollback");
    }
  }

  async function handleRefresh() {
    if (!selectedCopy) return;
    if (!confirm("Refresh from the original system document? This will update your copy to the latest published version.")) return;

    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/tenant/document-copies/${selectedCopy.id}/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to refresh");

      loadCopyDetail(selectedCopy.id);
      loadCopies();
    } catch (err: any) {
      alert(err.message || "Failed to refresh");
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>My Document Copies</h1>
        <Link
          href="/documents/system"
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
          ← Browse System Documents
        </Link>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 16, padding: 12, background: "#fef2f2", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {copies.length === 0 ? (
        <div style={{ color: "#6b7280", padding: 24, textAlign: "center", background: "#f9fafb", borderRadius: 8 }}>
          You haven't copied any system documents yet.{" "}
          <Link href="/documents/system" style={{ color: "#2563eb" }}>
            Browse available documents
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24 }}>
          {/* Copy List */}
          <div style={{ flex: "0 0 300px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {copies.map((copy) => (
                <button
                  key={copy.id}
                  onClick={() => loadCopyDetail(copy.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: selectedCopy?.id === copy.id ? "#2563eb" : "#e5e7eb",
                    background: selectedCopy?.id === copy.id ? "#eff6ff" : "white",
                    textAlign: "left",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {copy.hasNewerSystemVersion && (
                    <span
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#f59e0b",
                      }}
                      title="Newer version available"
                    />
                  )}
                  <div style={{ fontWeight: 500, fontSize: 13 }}>
                    {copy.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    From: {copy.sourcePublication.systemDocument.code} · v{copy.currentVersion?.versionNo || 1}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Copy Viewer/Editor */}
          <div style={{ flex: 1 }}>
            {selectedCopy ? (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                      {selectedCopy.title}
                      {selectedCopy.hasNewerSystemVersion && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: 11,
                          }}
                        >
                          ⭐ Update available
                        </span>
                      )}
                    </h2>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                      Based on: {selectedCopy.sourcePublication.systemDocument.code} (v{selectedCopy.sourcePublication.systemDocumentVersion.versionNo})
                      · Your version: {selectedCopy.currentVersion?.versionNo || 1}
                    </div>
                  </div>
                  {!editing && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setShowVersions(true)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          background: "white",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        History
                      </button>
                      {selectedCopy.hasNewerSystemVersion && (
                        <button
                          onClick={handleRefresh}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 4,
                            border: "1px solid #f59e0b",
                            background: "#fffbeb",
                            color: "#92400e",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Refresh
                        </button>
                      )}
                      <button
                        onClick={startEditing}
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
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div>
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
                          placeholder="What changed?"
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
                  <div
                    style={{
                      padding: 16,
                      background: "#f9fafb",
                      borderRadius: 4,
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                    dangerouslySetInnerHTML={{ __html: selectedCopy.currentVersion?.htmlContent || "<em>No content</em>" }}
                  />
                )}
              </div>
            ) : (
              <div style={{ color: "#9ca3af", padding: 24, textAlign: "center", background: "#f9fafb", borderRadius: 8 }}>
                Select a document copy to view or edit
              </div>
            )}
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersions && selectedCopy && (
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
          onClick={() => setShowVersions(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Version History</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedCopy.versions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 12,
                    background: v.id === selectedCopy.currentVersion?.id ? "#eff6ff" : "#f9fafb",
                    borderRadius: 4,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      Version {v.versionNo}
                      {v.id === selectedCopy.currentVersion?.id && (
                        <span style={{ color: "#2563eb", marginLeft: 8 }}>(current)</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {new Date(v.createdAt).toLocaleString()}
                      {v.notes && ` · ${v.notes}`}
                    </div>
                  </div>
                  {v.id !== selectedCopy.currentVersion?.id && (
                    <button
                      onClick={() => handleRollback(v.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        background: "white",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={() => setShowVersions(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
