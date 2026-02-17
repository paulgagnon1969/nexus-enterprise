"use client";

import { useState, useEffect, useCallback } from "react";

interface SupplierTag {
  id: string;
  category: "REGION" | "TRADE" | "SCOPE";
  code: string;
  label: string;
  color?: string;
}

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  defaultContactName?: string;
  defaultContactEmail?: string;
  notes?: string;
  isActive: boolean;
  tagAssignments: { tag: SupplierTag }[];
  contacts: { id: string; name: string; email?: string; phone?: string; role?: string; isPrimary: boolean }[];
  _count: { bidRecipients: number };
}

const TAG_COLORS: Record<string, string> = {
  REGION: "#3b82f6",
  TRADE: "#10b981",
  SCOPE: "#f59e0b",
};

export default function SuppliersSettingsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tags, setTags] = useState<SupplierTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  // Modal states
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);

  // Form state
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    email: "",
    phone: "",
    website: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    defaultContactName: "",
    defaultContactEmail: "",
    defaultContactPhone: "",
    notes: "",
    tagIds: [] as string[],
  });

  const [tagForm, setTagForm] = useState({
    category: "TRADE" as "REGION" | "TRADE" | "SCOPE",
    code: "",
    label: "",
    color: "",
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTagIds.length) params.set("tagIds", selectedTagIds.join(","));
      if (!showInactive) params.set("isActive", "true");

      const res = await fetch(`/api/suppliers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [search, selectedTagIds, showInactive]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers/tags", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      setTags(data || []);
    } catch (err: any) {
      console.error("Failed to fetch tags:", err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSuppliers(), fetchTags()]).finally(() => setLoading(false));
  }, [fetchSuppliers, fetchTags]);

  const handleSaveSupplier = async () => {
    try {
      const method = editingSupplier ? "PUT" : "POST";
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : "/api/suppliers";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save supplier");
      }

      setShowSupplierModal(false);
      setEditingSupplier(null);
      resetSupplierForm();
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete supplier");
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveTag = async () => {
    try {
      const res = await fetch("/api/suppliers/tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tagForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create tag");
      }

      setShowTagModal(false);
      setTagForm({ category: "TRADE", code: "", label: "", color: "" });
      fetchTags();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Delete this tag? It will be removed from all suppliers.")) return;

    try {
      const res = await fetch(`/api/suppliers/tags/${tagId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete tag");
      fetchTags();
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      name: "",
      email: "",
      phone: "",
      website: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      defaultContactName: "",
      defaultContactEmail: "",
      defaultContactPhone: "",
      notes: "",
      tagIds: [],
    });
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      email: supplier.email || "",
      phone: supplier.phone || "",
      website: supplier.website || "",
      addressLine1: supplier.addressLine1 || "",
      city: supplier.city || "",
      state: supplier.state || "",
      postalCode: supplier.postalCode || "",
      defaultContactName: supplier.defaultContactName || "",
      defaultContactEmail: supplier.defaultContactEmail || "",
      defaultContactPhone: "",
      notes: supplier.notes || "",
      tagIds: supplier.tagAssignments.map((ta) => ta.tag.id),
    });
    setShowSupplierModal(true);
  };

  const groupedTags = {
    REGION: tags.filter((t) => t.category === "REGION"),
    TRADE: tags.filter((t) => t.category === "TRADE"),
    SCOPE: tags.filter((t) => t.category === "SCOPE"),
  };

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "#6b7280" }}>Loading suppliers...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Suppliers & Subcontractors</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Manage your supplier directory for bid requests
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowTagModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Manage Tags
          </button>
          <button
            onClick={() => {
              resetSupplierForm();
              setEditingSupplier(null);
              setShowSupplierModal(true);
            }}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            + Add Supplier
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fef2f2", color: "#dc2626", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            width: 250,
            fontSize: 13,
          }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {tags.slice(0, 10).map((tag) => (
            <button
              key={tag.id}
              onClick={() => {
                setSelectedTagIds((prev) =>
                  prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                );
              }}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                border: "1px solid",
                borderColor: selectedTagIds.includes(tag.id) ? TAG_COLORS[tag.category] : "#d1d5db",
                background: selectedTagIds.includes(tag.id) ? TAG_COLORS[tag.category] : "#fff",
                color: selectedTagIds.includes(tag.id) ? "#fff" : "#374151",
                borderRadius: 20,
                cursor: "pointer",
              }}
            >
              {tag.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {/* Suppliers Table */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Supplier</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Contact</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tags</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>Bids</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                  No suppliers found. Add your first supplier to get started.
                </td>
              </tr>
            ) : (
              suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    background: !supplier.isActive ? "#f9fafb" : undefined,
                    opacity: !supplier.isActive ? 0.6 : 1,
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500 }}>{supplier.name}</div>
                    {supplier.city && supplier.state && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {supplier.city}, {supplier.state}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div>{supplier.defaultContactName || supplier.email || "—"}</div>
                    {supplier.phone && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{supplier.phone}</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {supplier.tagAssignments.map((ta) => (
                        <span
                          key={ta.tag.id}
                          style={{
                            padding: "2px 8px",
                            fontSize: 10,
                            background: TAG_COLORS[ta.tag.category] + "20",
                            color: TAG_COLORS[ta.tag.category],
                            borderRadius: 10,
                            fontWeight: 500,
                          }}
                        >
                          {ta.tag.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {supplier._count.bidRecipients || 0}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openEditSupplier(supplier)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          background: "#f3f4f6",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          background: "#fef2f2",
                          color: "#dc2626",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
        Showing {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
      </div>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowSupplierModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 600,
              maxHeight: "90vh",
              overflow: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
              {editingSupplier ? "Edit Supplier" : "Add Supplier"}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Company Name *
                </label>
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Email</label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Phone</label>
                <input
                  type="tel"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>City</label>
                <input
                  type="text"
                  value={supplierForm.city}
                  onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>State</label>
                <input
                  type="text"
                  value={supplierForm.state}
                  onChange={(e) => setSupplierForm({ ...supplierForm, state: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Default Contact Name
                </label>
                <input
                  type="text"
                  value={supplierForm.defaultContactName}
                  onChange={(e) => setSupplierForm({ ...supplierForm, defaultContactName: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Tags</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(["REGION", "TRADE", "SCOPE"] as const).map((category) => (
                    <div key={category}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{category}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {groupedTags[category].map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              setSupplierForm((prev) => ({
                                ...prev,
                                tagIds: prev.tagIds.includes(tag.id)
                                  ? prev.tagIds.filter((id) => id !== tag.id)
                                  : [...prev.tagIds, tag.id],
                              }));
                            }}
                            style={{
                              padding: "4px 10px",
                              fontSize: 11,
                              border: "1px solid",
                              borderColor: supplierForm.tagIds.includes(tag.id)
                                ? TAG_COLORS[category]
                                : "#d1d5db",
                              background: supplierForm.tagIds.includes(tag.id)
                                ? TAG_COLORS[category]
                                : "#fff",
                              color: supplierForm.tagIds.includes(tag.id) ? "#fff" : "#374151",
                              borderRadius: 20,
                              cursor: "pointer",
                            }}
                          >
                            {tag.label}
                          </button>
                        ))}
                        {groupedTags[category].length === 0 && (
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>No tags</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Notes</label>
                <textarea
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowSupplierModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={!supplierForm.name.trim()}
                style={{
                  padding: "8px 16px",
                  background: supplierForm.name.trim() ? "#2563eb" : "#9ca3af",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: supplierForm.name.trim() ? "pointer" : "not-allowed",
                  fontWeight: 500,
                }}
              >
                {editingSupplier ? "Save Changes" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Management Modal */}
      {showTagModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowTagModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 500,
              maxHeight: "90vh",
              overflow: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Manage Supplier Tags</h2>

            {/* Add new tag */}
            <div style={{ marginBottom: 24, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add New Tag</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Category</label>
                  <select
                    value={tagForm.category}
                    onChange={(e) =>
                      setTagForm({ ...tagForm, category: e.target.value as "REGION" | "TRADE" | "SCOPE" })
                    }
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                  >
                    <option value="REGION">Region</option>
                    <option value="TRADE">Trade</option>
                    <option value="SCOPE">Scope</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Code</label>
                  <input
                    type="text"
                    placeholder="e.g. FL, ROOF"
                    value={tagForm.code}
                    onChange={(e) => setTagForm({ ...tagForm, code: e.target.value.toUpperCase() })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Florida, Roofing"
                    value={tagForm.label}
                    onChange={(e) => setTagForm({ ...tagForm, label: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                </div>
              </div>
              <button
                onClick={handleSaveTag}
                disabled={!tagForm.code.trim() || !tagForm.label.trim()}
                style={{
                  marginTop: 12,
                  padding: "8px 16px",
                  background: tagForm.code.trim() && tagForm.label.trim() ? "#2563eb" : "#9ca3af",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: tagForm.code.trim() && tagForm.label.trim() ? "pointer" : "not-allowed",
                  fontWeight: 500,
                }}
              >
                Add Tag
              </button>
            </div>

            {/* Existing tags */}
            {(["REGION", "TRADE", "SCOPE"] as const).map((category) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <h3
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: TAG_COLORS[category],
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  {category}
                </h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {groupedTags[category].map((tag) => (
                    <div
                      key={tag.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        background: TAG_COLORS[category] + "15",
                        borderRadius: 20,
                        fontSize: 12,
                      }}
                    >
                      <span>{tag.label}</span>
                      <span style={{ color: "#9ca3af", fontSize: 10 }}>({tag.code})</span>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {groupedTags[category].length === 0 && (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>No tags in this category</span>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <button
                onClick={() => setShowTagModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
