"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Manual {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  iconEmoji: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  _count: {
    chapters: number;
    documents: number;
  };
}

export default function TenantManualsPage() {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Create manual form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState("📘");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const storedRole = localStorage.getItem("companyRole");
    setUserRole(storedRole);
    loadManuals();
  }, []);

  async function loadManuals() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      // Fetch tenant-owned manuals (API will filter by current company)
      const res = await fetch(`${API_BASE}/manuals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          // User doesn't have access - show empty state
          setManuals([]);
          return;
        }
        throw new Error("Failed to load manuals");
      }
      const data = await res.json();
      setManuals(data);
    } catch (err: any) {
      setError(err.message || "Failed to load manuals");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newTitle.trim()) return;

    setCreating(true);
    try {
      const token = localStorage.getItem("accessToken");
      const companyId = localStorage.getItem("companyId");
      
      const res = await fetch(`${API_BASE}/manuals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newCode.trim(),
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          iconEmoji: newIcon || "📘",
          ownerCompanyId: companyId, // Tenant-owned manual
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create manual");
      }

      // Reset form and reload
      setNewCode("");
      setNewTitle("");
      setNewDescription("");
      setNewIcon("📘");
      setShowCreateForm(false);
      loadManuals();
    } catch (err: any) {
      alert(err.message || "Failed to create manual");
    } finally {
      setCreating(false);
    }
  }

  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Link href="/documents" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
                ← Documents
              </Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 20 }}>📘 Manuals</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
              Organized document collections for your organization - handbooks, guides, and reference manuals.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              + Create Manual
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Loading manuals...</div>
        )}

        {/* Empty State */}
        {!loading && manuals.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px dashed #d1d5db",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📘</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>No manuals yet</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              {isAdmin
                ? "Create your first manual to organize documents into handbooks and guides."
                : "Your organization hasn't created any manuals yet."}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowCreateForm(true)}
                style={{
                  marginTop: 16,
                  padding: "10px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                + Create Manual
              </button>
            )}
          </div>
        )}

        {/* Manual List */}
        {!loading && manuals.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {manuals.map((manual) => (
              <Link
                key={manual.id}
                href={`/documents/manuals/${manual.id}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: 16,
                  background: manual.status === "DRAFT" ? "#fffbeb" : "white",
                  border: `1px solid ${manual.status === "DRAFT" ? "#fef3c7" : "#e5e7eb"}`,
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>{manual.iconEmoji || "📘"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{manual.title}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{manual.code}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: manual.status === "PUBLISHED" ? "#dcfce7" : manual.status === "DRAFT" ? "#fef3c7" : "#f3f4f6",
                      color: manual.status === "PUBLISHED" ? "#166534" : manual.status === "DRAFT" ? "#92400e" : "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    {manual.status}
                  </span>
                </div>
                {manual.description && (
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
                    {manual.description}
                  </p>
                )}
                <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", gap: 12, marginTop: "auto" }}>
                  <span>{manual._count.chapters} chapters</span>
                  <span>{manual._count.documents} documents</span>
                  <span>v{manual.currentVersion}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Manual Modal */}
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
                borderRadius: 10,
                padding: 24,
                width: "90%",
                maxWidth: 480,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Create Manual</h2>
              <form onSubmit={handleCreate}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <label style={{ fontSize: 13, flex: "0 0 80px" }}>
                      <span style={{ display: "block", marginBottom: 4 }}>Icon</span>
                      <input
                        type="text"
                        value={newIcon}
                        onChange={(e) => setNewIcon(e.target.value)}
                        placeholder="📘"
                        maxLength={2}
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 20,
                          textAlign: "center",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 13, flex: 1 }}>
                      <span style={{ display: "block", marginBottom: 4 }}>Code *</span>
                      <input
                        type="text"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        placeholder="e.g., employee-handbook"
                        style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
                        required
                      />
                    </label>
                  </div>
                  <label style={{ fontSize: 13 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>Title *</span>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Employee Handbook"
                      style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
                      required
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>Description</span>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Brief description of this manual..."
                      rows={3}
                      style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #d1d5db", resize: "vertical" }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
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
                      borderRadius: 6,
                      border: "none",
                      background: "#2563eb",
                      color: "white",
                      cursor: creating ? "default" : "pointer",
                      opacity: creating ? 0.7 : 1,
                    }}
                  >
                    {creating ? "Creating..." : "Create Manual"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageCard>
  );
}
