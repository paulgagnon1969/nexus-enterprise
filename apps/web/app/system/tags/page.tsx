"use client";

import { useEffect, useState, useCallback } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemTag {
  id: string;
  code: string;
  label: string;
  description?: string;
  category?: string;
  color?: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  _count: { companyTags: number };
}

interface Company {
  id: string;
  name: string;
}

interface CompanyTag {
  id: string;
  systemTag: SystemTag;
  assignedAt: string;
  assignedBy: { email: string; firstName?: string; lastName?: string };
}

export default function SystemTagsPage() {
  const [tags, setTags] = useState<SystemTag[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showInactive, setShowInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTag, setEditTag] = useState<SystemTag | null>(null);
  const [viewTag, setViewTag] = useState<SystemTag | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const loadTags = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("includeInactive", "true");
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`${API_BASE}/system/tags?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Failed to load tags");
      const data = await res.json();
      setTags(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load tags");
    }
  }, [showInactive, categoryFilter]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/tags/categories`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([loadTags(), loadCategories()]).finally(() => setLoading(false));
  }, [loadTags, loadCategories]);

  useEffect(() => {
    if (!loading) loadTags();
  }, [showInactive, categoryFilter, loadTags, loading]);

  const handleCreate = async (data: {
    code: string;
    label: string;
    description?: string;
    category?: string;
    color?: string;
  }) => {
    try {
      const res = await fetch(`${API_BASE}/system/tags`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create tag");
      }
      setShowCreateModal(false);
      loadTags();
      loadCategories();
    } catch (err: any) {
      alert(err?.message || "Failed to create tag");
    }
  };

  const handleUpdate = async (
    id: string,
    data: { label?: string; description?: string; category?: string; color?: string; active?: boolean }
  ) => {
    try {
      const res = await fetch(`${API_BASE}/system/tags/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update tag");
      setEditTag(null);
      loadTags();
      loadCategories();
    } catch (err: any) {
      alert(err?.message || "Failed to update tag");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this tag?")) return;
    try {
      const res = await fetch(`${API_BASE}/system/tags/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete tag");
      loadTags();
    } catch (err: any) {
      alert(err?.message || "Failed to delete tag");
    }
  };

  // Group tags by category
  const groupedTags = tags.reduce(
    (acc, tag) => {
      const cat = tag.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tag);
      return acc;
    },
    {} as Record<string, SystemTag[]>
  );

  if (loading) {
    return (
      <PageCard>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading system tags...</p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>System Tags</h1>
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
            <h1 style={{ margin: 0, fontSize: 22 }}>System Tags</h1>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
              Manage tags for tenant classification and selective document distribution.
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
            + Create Tag
          </button>
        </header>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              backgroundColor: "#ffffff",
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#4b5563" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>

          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
            {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Tags grouped by category */}
        {Object.keys(groupedTags).length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              color: "#6b7280",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>No tags found</div>
            <div style={{ fontSize: 14 }}>Create your first tag to start classifying tenants.</div>
          </div>
        ) : (
          Object.entries(groupedTags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryTags]) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {category}
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {categoryTags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      onEdit={() => setEditTag(tag)}
                      onView={() => setViewTag(tag)}
                      onDelete={() => handleDelete(tag.id)}
                    />
                  ))}
                </div>
              </div>
            ))
        )}

        {/* Preset Templates */}
        <div
          style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: "#f0f9ff",
            borderRadius: 8,
            border: "1px solid #bae6fd",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#0369a1" }}>
            💡 Suggested Tag Categories
          </h3>
          <div style={{ fontSize: 13, color: "#0284c7", lineHeight: 1.6 }}>
            <strong>Tier:</strong> tier:basic, tier:standard, tier:premium, tier:enterprise
            <br />
            <strong>Region:</strong> region:west, region:midwest, region:south, region:northeast
            <br />
            <strong>Feature:</strong> feature:advanced-reporting, feature:api-access, feature:custom-branding
            <br />
            <strong>Industry:</strong> industry:restoration, industry:construction, industry:insurance
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <TagFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          categories={categories}
        />
      )}

      {/* Edit Modal */}
      {editTag && (
        <TagFormModal
          tag={editTag}
          onClose={() => setEditTag(null)}
          onSubmit={(data) => handleUpdate(editTag.id, data)}
          categories={categories}
        />
      )}

      {/* View Tag Detail Modal */}
      {viewTag && <TagDetailModal tag={viewTag} onClose={() => setViewTag(null)} />}
    </PageCard>
  );
}

// --- Tag Chip Component ---

function TagChip({
  tag,
  onEdit,
  onView,
  onDelete,
}: {
  tag: SystemTag;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        backgroundColor: tag.active ? "#ffffff" : "#f3f4f6",
        border: `1px solid ${tag.color || "#e5e7eb"}`,
        borderRadius: 8,
        opacity: tag.active ? 1 : 0.6,
      }}
    >
      {tag.color && (
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: tag.color,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{tag.label}</div>
        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{tag.code}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 4,
          backgroundColor: "#dbeafe",
          color: "#1e40af",
        }}
        title="Tenants assigned"
      >
        {tag._count.companyTags}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={onView}
          title="View assigned tenants"
          style={{
            padding: 4,
            fontSize: 12,
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          👁️
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="Edit tag"
          style={{
            padding: 4,
            fontSize: 12,
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          ✏️
        </button>
        {tag.active && (
          <button
            type="button"
            onClick={onDelete}
            title="Deactivate tag"
            style={{
              padding: 4,
              fontSize: 12,
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// --- Tag Form Modal ---

function TagFormModal({
  tag,
  categories,
  onClose,
  onSubmit,
}: {
  tag?: SystemTag;
  categories: string[];
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [code, setCode] = useState(tag?.code || "");
  const [label, setLabel] = useState(tag?.label || "");
  const [description, setDescription] = useState(tag?.description || "");
  const [category, setCategory] = useState(tag?.category || "");
  const [newCategory, setNewCategory] = useState("");
  const [color, setColor] = useState(tag?.color || "#3b82f6");
  const [active, setActive] = useState(tag?.active ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = !!tag;

  const handleSubmit = async () => {
    if (!code.trim() || !label.trim()) {
      alert("Code and label are required");
      return;
    }
    setIsSubmitting(true);
    await onSubmit({
      code: code.trim(),
      label: label.trim(),
      description: description.trim() || undefined,
      category: (newCategory.trim() || category) || undefined,
      color: color || undefined,
      ...(isEdit ? { active } : {}),
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
          maxWidth: 450,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>{isEdit ? "Edit Tag" : "Create Tag"}</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontSize: 14, color: "#6b7280" }}>
          {isEdit ? "Update tag details." : "Create a new system tag for tenant classification."}
        </p>

        {/* Code */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Code *
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9:-]/g, ""))}
            placeholder="e.g., tier:premium"
            disabled={isEdit}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "monospace",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              backgroundColor: isEdit ? "#f3f4f6" : "#ffffff",
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Lowercase, use colons for namespacing (e.g., tier:premium, region:west)
          </p>
        </div>

        {/* Label */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Label *
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Premium Tier"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid #d1d5db",
              borderRadius: 6,
            }}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Category
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setNewCategory("");
              }}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "#ffffff",
              }}
            >
              <option value="">Select or create new...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          {!category && (
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Or type new category..."
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 6,
              }}
            />
          )}
        </div>

        {/* Color */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Color
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 40, height: 36, padding: 0, border: "none", cursor: "pointer" }}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "monospace",
                border: "1px solid #d1d5db",
                borderRadius: 6,
              }}
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Description
          </label>
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

        {/* Active (edit only) */}
        {isEdit && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>
        )}

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
            {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Tag Detail Modal (View assigned companies) ---

function TagDetailModal({ tag, onClose }: { tag: SystemTag; onClose: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`${API_BASE}/system/tags/${tag.id}/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCompanies(data.companies || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };
    loadCompanies();
  }, [tag.id]);

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
          overflow: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {tag.color && (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: tag.color,
              }}
            />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tag.label}</h2>
            <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>{tag.code}</div>
          </div>
        </div>

        {tag.description && (
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563" }}>{tag.description}</p>
        )}

        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#374151" }}>
          Assigned Tenants ({companies.length})
        </h3>

        {loading ? (
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading...</p>
        ) : companies.length === 0 ? (
          <p style={{ fontSize: 14, color: "#6b7280", fontStyle: "italic" }}>
            No tenants assigned to this tag yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {companies.map((company) => (
              <div
                key={company.id}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#f9fafb",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                {company.name}
              </div>
            ))}
          </div>
        )}

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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
