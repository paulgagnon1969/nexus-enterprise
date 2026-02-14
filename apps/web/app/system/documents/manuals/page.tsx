"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Manual {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  currentVersion: number;
  publicSlug?: string;
  isPublic: boolean;
  publishToAllTenants: boolean;
  iconEmoji?: string;
  createdAt: string;
  publishedAt?: string;
  createdBy: { id: string; email: string; firstName?: string; lastName?: string };
  _count: { chapters: number; documents: number };
  targetTags: { systemTag: { id: string; code: string; label: string; color?: string } }[];
}

export default function ManualsPage() {
  const router = useRouter();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const loadManuals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showArchived) params.set("includeArchived", "true");

      const res = await fetch(`${API_BASE}/system/manuals?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to load manuals");
      const data = await res.json();
      setManuals(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load manuals");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadManuals();
  }, [loadManuals]);

  const handleCreate = async (data: { code: string; title: string; description?: string; iconEmoji?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/system/manuals`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create manual");
      }
      const created = await res.json();
      setShowCreateModal(false);
      router.push(`/system/documents/manuals/${created.id}`);
    } catch (err: any) {
      alert(err?.message || "Failed to create manual");
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
          padding: "2px 8px",
          fontSize: 11,
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
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading manuals...</p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Manuals & Handbooks</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Manuals & Handbooks</h1>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
              Organize documents into structured manuals with chapters and versioning.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            + Create Manual
          </button>
        </header>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4b5563" }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>

          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
            {manuals.length} manual{manuals.length !== 1 ? "s" : ""}
          </span>

          <a
            href="/system/documents"
            style={{ fontSize: 13, color: "#2563eb", textDecoration: "underline" }}
          >
            ← Back to Documents
          </a>
        </div>

        {/* Manuals Grid */}
        {manuals.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              color: "#6b7280",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>No manuals yet</div>
            <div style={{ fontSize: 14 }}>Create your first manual to organize documents.</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {manuals.map((manual) => (
              <div
                key={manual.id}
                onClick={() => router.push(`/system/documents/manuals/${manual.id}`)}
                style={{
                  padding: 16,
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      flexShrink: 0,
                    }}
                  >
                    {manual.iconEmoji || "📘"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {manual.title}
                      </h3>
                      {getStatusBadge(manual.status)}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", marginBottom: 4 }}>
                      {manual.code}
                    </div>
                    {manual.description && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 13,
                          color: "#4b5563",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {manual.description}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid #f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  <span>v{manual.currentVersion}</span>
                  <span>{manual._count.chapters} chapters</span>
                  <span>{manual._count.documents} docs</span>
                  {manual.isPublic && (
                    <span
                      style={{
                        padding: "1px 6px",
                        backgroundColor: "#dbeafe",
                        color: "#1e40af",
                        borderRadius: 4,
                        fontSize: 10,
                      }}
                    >
                      PUBLIC
                    </span>
                  )}
                </div>

                {manual.targetTags.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {manual.targetTags.slice(0, 3).map((tt) => (
                      <span
                        key={tt.systemTag.id}
                        style={{
                          padding: "2px 6px",
                          fontSize: 10,
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          borderRadius: 4,
                          border: `1px solid ${tt.systemTag.color || "#e5e7eb"}`,
                        }}
                      >
                        {tt.systemTag.label}
                      </span>
                    ))}
                    {manual.targetTags.length > 3 && (
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>
                        +{manual.targetTags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateManualModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} />
      )}
    </PageCard>
  );
}

// --- Create Manual Modal ---

function CreateManualModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { code: string; title: string; description?: string; iconEmoji?: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [iconEmoji, setIconEmoji] = useState("📘");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const EMOJI_OPTIONS = ["📘", "📕", "📗", "📙", "📓", "📒", "📚", "📖", "🛡️", "⚙️", "🏗️", "👷"];

  const handleSubmit = async () => {
    if (!code.trim() || !title.trim()) {
      alert("Code and title are required");
      return;
    }
    setIsSubmitting(true);
    await onSubmit({
      code: code.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      iconEmoji: iconEmoji || undefined,
    });
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
          maxWidth: 480,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Create New Manual</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          Start a new manual to organize your documents into chapters.
        </p>

        {/* Icon selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            Icon
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIconEmoji(emoji)}
                style={{
                  width: 40,
                  height: 40,
                  fontSize: 20,
                  border: iconEmoji === emoji ? "2px solid #2563eb" : "1px solid #d1d5db",
                  borderRadius: 8,
                  backgroundColor: iconEmoji === emoji ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Code */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Code *
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="e.g., safety-manual"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "monospace",
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Unique identifier, lowercase with hyphens
          </p>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Safety Manual"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this manual..."
            rows={3}
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

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
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
            {isSubmitting ? "Creating..." : "Create Manual"}
          </button>
        </div>
      </div>
    </div>
  );
}
