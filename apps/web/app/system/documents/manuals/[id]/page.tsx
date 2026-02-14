"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocument {
  id: string;
  code: string;
  title: string;
  category?: string;
  currentVersion?: { versionNo: number };
}

interface ManualDocument {
  id: string;
  systemDocumentId: string;
  displayTitleOverride?: string;
  sortOrder: number;
  systemDocument: SystemDocument;
}

interface ManualChapter {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  documents: ManualDocument[];
}

interface Manual {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  currentVersion: number;
  iconEmoji?: string;
  isPublic: boolean;
  publicSlug?: string;
  publishToAllTenants: boolean;
  chapters: ManualChapter[];
  documents: ManualDocument[]; // Root-level documents
  targetTags: { systemTag: { id: string; code: string; label: string; color?: string } }[];
}

interface AvailableDoc {
  id: string;
  code: string;
  title: string;
  category?: string;
  currentVersion?: { versionNo: number };
  alreadyInManual: boolean;
}

export default function ManualEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: manualId } = React.use(params);
  const router = useRouter();

  const [manual, setManual] = useState<Manual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState<{ chapterId?: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<AvailableDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const loadManual = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load manual");
      const data = await res.json();
      setManual(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load manual");
    } finally {
      setLoading(false);
    }
  }, [manualId]);

  useEffect(() => {
    loadManual();
  }, [loadManual]);

  const loadAvailableDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/available-documents`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableDocs(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingDocs(false);
    }
  };

  // --- Chapter Operations ---

  const handleAddChapter = async (title: string, description?: string) => {
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/chapters`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error("Failed to add chapter");
      const updated = await res.json();
      setManual(updated);
      setShowAddChapter(false);
    } catch (err: any) {
      alert(err?.message || "Failed to add chapter");
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm("Remove this chapter? Documents will be moved to root level.")) return;
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/chapters/${chapterId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to remove chapter");
      const updated = await res.json();
      setManual(updated);
    } catch (err: any) {
      alert(err?.message || "Failed to remove chapter");
    }
  };

  // --- Document Operations ---

  const handleAddDocument = async (systemDocumentId: string, chapterId?: string) => {
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/documents`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ systemDocumentId, chapterId }),
      });
      if (!res.ok) throw new Error("Failed to add document");
      const updated = await res.json();
      setManual(updated);
      setShowAddDocument(null);
    } catch (err: any) {
      alert(err?.message || "Failed to add document");
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    if (!confirm("Remove this document from the manual?")) return;
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/documents/${docId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to remove document");
      const updated = await res.json();
      setManual(updated);
    } catch (err: any) {
      alert(err?.message || "Failed to remove document");
    }
  };

  // --- Publish ---

  const handlePublish = async () => {
    if (!confirm("Publish this manual? This will create a new version.")) return;
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/publish`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to publish manual");
      const updated = await res.json();
      setManual(updated);
    } catch (err: any) {
      alert(err?.message || "Failed to publish manual");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      DRAFT: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
      PUBLISHED: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
      ARCHIVED: { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db" },
    };
    const s = styles[status] || styles.DRAFT;
    return (
      <span
        style={{
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 999,
          backgroundColor: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
        }}
      >
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <PageCard>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading manual...</p>
      </PageCard>
    );
  }

  if (error || !manual) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Manual Editor</h1>
        <p style={{ color: "#b91c1c" }}>{error || "Manual not found"}</p>
        <a href="/system/documents/manuals" style={{ color: "#2563eb" }}>
          ← Back to Manuals
        </a>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundColor: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
              }}
            >
              {manual.iconEmoji || "📘"}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h1 style={{ margin: 0, fontSize: 22 }}>{manual.title}</h1>
                {getStatusBadge(manual.status)}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                <span style={{ fontFamily: "monospace" }}>{manual.code}</span>
                {" · "}
                <span>Version {manual.currentVersion}</span>
                {" · "}
                <span>{manual.chapters.length} chapters</span>
                {" · "}
                <span>
                  {manual.chapters.reduce((sum, ch) => sum + ch.documents.length, 0) + manual.documents.length} docs
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: manual.isPublic ? "#7c3aed" : "#6b7280",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 16 }}>🔗</span> {manual.isPublic ? "Public" : "Share"}
            </button>
            <a
              href={`/system/documents/manuals/${manual.id}/preview`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "#374151",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 16 }}>👁️</span> Preview & Export
            </a>
            <button
              type="button"
              onClick={handlePublish}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "#059669",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Publish
            </button>
            <a
              href="/system/documents/manuals"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                backgroundColor: "#ffffff",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              ← Back
            </a>
          </div>
        </header>

        {manual.description && (
          <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>{manual.description}</p>
        )}

        {/* Target Tags */}
        {manual.targetTags.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Targets:</span>
            {manual.targetTags.map((tt) => (
              <span
                key={tt.systemTag.id}
                style={{
                  padding: "2px 8px",
                  fontSize: 11,
                  backgroundColor: "#f3f4f6",
                  borderRadius: 4,
                  border: `1px solid ${tt.systemTag.color || "#e5e7eb"}`,
                }}
              >
                {tt.systemTag.label}
              </span>
            ))}
          </div>
        )}

        <hr style={{ margin: 0, border: "none", borderTop: "1px solid #e5e7eb" }} />

        {/* Add Chapter Button */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowAddChapter(true)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            + Add Chapter
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddDocument({ chapterId: undefined });
              loadAvailableDocuments();
            }}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            + Add Document (root)
          </button>
        </div>

        {/* Chapters */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {manual.chapters.map((chapter) => (
            <div
              key={chapter.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{chapter.title}</h3>
                  {chapter.description && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{chapter.description}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDocument({ chapterId: chapter.id });
                      loadAvailableDocuments();
                    }}
                    style={{
                      padding: "4px 8px",
                      fontSize: 12,
                      backgroundColor: "#ffffff",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    + Doc
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChapter(chapter.id)}
                    style={{
                      padding: "4px 8px",
                      fontSize: 12,
                      backgroundColor: "#fef2f2",
                      color: "#b91c1c",
                      border: "1px solid #fecaca",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div style={{ padding: 8 }}>
                {chapter.documents.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                    No documents in this chapter
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {chapter.documents.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} onRemove={() => handleRemoveDocument(doc.id)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Root-level documents */}
          {manual.documents.length > 0 && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "#fafafa",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#6b7280" }}>
                  Uncategorized Documents
                </h3>
              </div>
              <div style={{ padding: 8 }}>
                {manual.documents.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onRemove={() => handleRemoveDocument(doc.id)} />
                ))}
              </div>
            </div>
          )}

          {manual.chapters.length === 0 && manual.documents.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: 40,
                backgroundColor: "#f9fafb",
                borderRadius: 8,
                color: "#6b7280",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14 }}>Start by adding chapters and documents</div>
            </div>
          )}
        </div>
      </div>

      {/* Add Chapter Modal */}
      {showAddChapter && (
        <AddChapterModal onClose={() => setShowAddChapter(false)} onSubmit={handleAddChapter} />
      )}

      {/* Add Document Modal */}
      {showAddDocument && (
        <AddDocumentModal
          chapterId={showAddDocument.chapterId}
          availableDocs={availableDocs}
          loading={loadingDocs}
          onClose={() => setShowAddDocument(null)}
          onSelect={(docId) => handleAddDocument(docId, showAddDocument.chapterId)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          manualId={manual.id}
          manualCode={manual.code}
          isPublic={manual.isPublic}
          publicSlug={manual.publicSlug}
          onClose={() => setShowShareModal(false)}
          onUpdate={loadManual}
        />
      )}
    </PageCard>
  );
}

// --- Document Row ---

function DocumentRow({ doc, onRemove }: { doc: ManualDocument; onRemove: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        backgroundColor: "#ffffff",
        border: "1px solid #f3f4f6",
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>📄</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {doc.displayTitleOverride || doc.systemDocument.title}
            {doc.systemDocument.currentVersion && (
              <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>
                (Rev {doc.systemDocument.currentVersion.versionNo})
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
            {doc.systemDocument.code}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          padding: "2px 6px",
          fontSize: 11,
          backgroundColor: "transparent",
          color: "#9ca3af",
          border: "none",
          cursor: "pointer",
        }}
        title="Remove from manual"
      >
        ✕
      </button>
    </div>
  );
}

// --- Add Chapter Modal ---

function AddChapterModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (title: string, description?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("Title is required");
      return;
    }
    setIsSubmitting(true);
    await onSubmit(title.trim(), description.trim() || undefined);
    setIsSubmitting(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Add Chapter</h2>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Introduction"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={2}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: isSubmitting ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Adding..." : "Add Chapter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Add Document Modal ---

function AddDocumentModal({
  chapterId,
  availableDocs,
  loading,
  onClose,
  onSelect,
}: {
  chapterId?: string;
  availableDocs: AvailableDoc[];
  loading: boolean;
  onClose: () => void;
  onSelect: (docId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredDocs = availableDocs.filter(
    (doc) =>
      !doc.alreadyInManual &&
      (doc.title.toLowerCase().includes(search.toLowerCase()) ||
        doc.code.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by category
  const grouped = filteredDocs.reduce(
    (acc, doc) => {
      const cat = doc.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(doc);
      return acc;
    },
    {} as Record<string, AvailableDoc[]>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 500,
          maxHeight: "80vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Add Document {chapterId ? "to Chapter" : "(Root Level)"}
        </h2>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents..."
          style={{
            marginTop: 16,
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid #d1d5db",
            borderRadius: 6,
          }}
        />

        <div style={{ flex: 1, overflow: "auto", marginTop: 16 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading...</div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
              No available documents
            </div>
          ) : (
            Object.entries(grouped).map(([category, docs]) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {category}
                </div>
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onSelect(doc.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 4,
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {doc.title}
                        {doc.currentVersion && (
                          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>
                            (Rev {doc.currentVersion.versionNo})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                        {doc.code}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Share Modal ---

function ShareModal({
  manualId,
  manualCode,
  isPublic,
  publicSlug,
  onClose,
  onUpdate,
}: {
  manualId: string;
  manualCode: string;
  isPublic: boolean;
  publicSlug?: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [localSlug, setLocalSlug] = useState(publicSlug || manualCode);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/manuals/${localSlug}`
    : `/manuals/${localSlug}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/public-settings`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isPublic: localIsPublic,
          publicSlug: localIsPublic ? localSlug : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update settings");
      }
      onUpdate();
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>🔗</span> Share Manual
        </h2>

        <div style={{ marginTop: 20 }}>
          {/* Public Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              backgroundColor: localIsPublic ? "#f0fdf4" : "#f9fafb",
              borderRadius: 8,
              border: `1px solid ${localIsPublic ? "#86efac" : "#e5e7eb"}`,
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Public Access</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Anyone with the link can view (read-only)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLocalIsPublic(!localIsPublic)}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                backgroundColor: localIsPublic ? "#22c55e" : "#d1d5db",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background-color 0.2s",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "#ffffff",
                  position: "absolute",
                  top: 3,
                  left: localIsPublic ? 23 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>

          {/* Public URL settings */}
          {localIsPublic && (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                Public URL Slug
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={localSlug}
                  onChange={(e) => setLocalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="my-manual"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 14,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontFamily: "monospace",
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                URL will be: <span style={{ fontFamily: "monospace" }}>{publicUrl}</span>
              </div>

              {/* Copy Link Button */}
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    fontSize: 14,
                    backgroundColor: copied ? "#dcfce7" : "#f3f4f6",
                    color: copied ? "#166534" : "#374151",
                    border: `1px solid ${copied ? "#86efac" : "#d1d5db"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    width: "100%",
                    justifyContent: "center",
                  }}
                >
                  {copied ? "✓ Copied!" : "📋 Copy Public Link"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: saving ? "#9ca3af" : "#7c3aed",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
