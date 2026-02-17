"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  defaultContactName?: string;
  tagAssignments: { tag: { id: string; label: string; category: string } }[];
}

interface BomFilters {
  categories: string[];
  catSels: string[];
  costTypes: string[];
}

const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "Materials",
  LABOR: "Labor",
  EQUIPMENT: "Equipment",
  ALL: "All Types",
};

export default function NewBidRequestPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [project, setProject] = useState<any>(null);
  const [filters, setFilters] = useState<BomFilters | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCostTypes, setSelectedCostTypes] = useState<string[]>(["MATERIAL"]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);

  // Fetch data
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch project details
        const projectRes = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          setProject(projectData);
          // Default title based on project
          setTitle(`Bid Request - ${projectData.addressLine1 || projectData.name || ""}`);
        }

        // Fetch BOM filters
        const filtersRes = await fetch(`/api/projects/${projectId}/bid-requests/filters`, {
          credentials: "include",
        });
        if (filtersRes.ok) {
          const filtersData = await filtersRes.json();
          setFilters(filtersData);
        }

        // Fetch suppliers
        const suppliersRes = await fetch("/api/suppliers?isActive=true", { credentials: "include" });
        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json();
          setSuppliers(suppliersData.suppliers || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [projectId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (selectedSupplierIds.length === 0) {
      setError("Please select at least one supplier");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/bid-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          filterConfig: {
            categories: selectedCategories.length > 0 ? selectedCategories : undefined,
            costTypes: selectedCostTypes.length > 0 ? selectedCostTypes : undefined,
          },
          supplierIds: selectedSupplierIds,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create bid request");
      }

      const bidRequest = await res.json();
      // Navigate to bid request detail page (or back to project)
      router.push(`/projects/${projectId}?tab=BOM`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleCostType = (type: string) => {
    setSelectedCostTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleSupplier = (id: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/projects/${projectId}?tab=BOM`}
          style={{ fontSize: 12, color: "#6b7280", textDecoration: "none" }}
        >
          ← Back to BOM
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>
          Create Supplier Bid Sheet
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Select materials from the BOM to send to suppliers for pricing
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fef2f2",
            color: "#dc2626",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Form sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Basic Info */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Bid Request Details</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Drywall Materials - 1548 Skyline"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Description (shared with suppliers)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what you're requesting bids for..."
                rows={2}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Internal Notes (not shared)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes for your team..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Filter by Cost Type */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Cost Types</h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Select which types of costs to include in this bid request
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters?.costTypes
              ?.filter((t) => t !== "ALL")
              .map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleCostType(type)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    border: "1px solid",
                    borderColor: selectedCostTypes.includes(type) ? "#10b981" : "#d1d5db",
                    background: selectedCostTypes.includes(type) ? "#10b981" : "#fff",
                    color: selectedCostTypes.includes(type) ? "#fff" : "#374151",
                    borderRadius: 20,
                    cursor: "pointer",
                    fontWeight: selectedCostTypes.includes(type) ? 600 : 400,
                  }}
                >
                  {COST_TYPE_LABELS[type] || type}
                </button>
              ))}
          </div>
        </section>

        {/* Filter by Category */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Categories (Optional)</h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Filter to specific categories. Leave empty to include all.
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 200, overflow: "auto" }}>
            {filters?.categories?.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  border: "1px solid",
                  borderColor: selectedCategories.includes(cat) ? "#2563eb" : "#e5e7eb",
                  background: selectedCategories.includes(cat) ? "#2563eb" : "#f9fafb",
                  color: selectedCategories.includes(cat) ? "#fff" : "#374151",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}
            {(!filters?.categories || filters.categories.length === 0) && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>No categories available</span>
            )}
          </div>

          {selectedCategories.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setSelectedCategories([])}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                Clear selection ({selectedCategories.length})
              </button>
            </div>
          )}
        </section>

        {/* Select Suppliers */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Select Suppliers *
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Choose suppliers to receive this bid request
          </p>

          {suppliers.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>No suppliers found</p>
              <Link
                href="/settings/suppliers"
                style={{
                  fontSize: 12,
                  color: "#2563eb",
                  textDecoration: "none",
                }}
              >
                Add suppliers in Settings →
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflow: "auto" }}>
              {suppliers.map((supplier) => (
                <label
                  key={supplier.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    border: "1px solid",
                    borderColor: selectedSupplierIds.includes(supplier.id) ? "#10b981" : "#e5e7eb",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: selectedSupplierIds.includes(supplier.id) ? "#f0fdf4" : "#fff",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSupplierIds.includes(supplier.id)}
                    onChange={() => toggleSupplier(supplier.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{supplier.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      {supplier.defaultContactName || supplier.email || "No contact info"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {supplier.tagAssignments?.slice(0, 3).map((ta) => (
                      <span
                        key={ta.tag.id}
                        style={{
                          padding: "2px 6px",
                          fontSize: 9,
                          background: "#f3f4f6",
                          borderRadius: 10,
                          color: "#6b7280",
                        }}
                      >
                        {ta.tag.label}
                      </span>
                    ))}
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedSupplierIds.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#059669", fontWeight: 500 }}>
              {selectedSupplierIds.length} supplier{selectedSupplierIds.length !== 1 ? "s" : ""} selected
            </div>
          )}
        </section>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 8 }}>
          <Link
            href={`/projects/${projectId}?tab=BOM`}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              background: "#f3f4f6",
              color: "#374151",
              border: "none",
              borderRadius: 6,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || selectedSupplierIds.length === 0}
            style={{
              padding: "10px 24px",
              fontSize: 13,
              background:
                submitting || !title.trim() || selectedSupplierIds.length === 0
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor:
                submitting || !title.trim() || selectedSupplierIds.length === 0
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 600,
            }}
          >
            {submitting ? "Creating..." : "Create Bid Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
