"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../../ui-shell";

interface BkmDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  lastUpdated: string;
  path: string;
  status: "published" | "coming-soon";
}

const BKM_CATEGORIES = [
  {
    id: "nexus-101",
    name: "NEXUS 101 — Core Operations",
    description: "Essential workflows every team member should know",
  },
  {
    id: "project-delivery",
    name: "Project Delivery",
    description: "Standards for running projects from kickoff to closeout",
  },
  {
    id: "inventory-materials",
    name: "Inventory & Materials",
    description: "Asset tracking, forecasting, and procurement workflows",
  },
  {
    id: "technical-standards",
    name: "Technical Standards",
    description: "Development patterns and performance guidelines",
  },
  {
    id: "integrations",
    name: "Integrations & Data",
    description: "Working with external systems and data imports",
  },
];

const BKM_DOCUMENTS: BkmDocument[] = [
  // NEXUS 101 — Core Operations
  {
    id: "BKM-NCC-001",
    title: "CSV Import and Line Item Reconciliation",
    description:
      "Standard operating procedure for importing Xactimate estimates and reconciling line items in NEXUS. Covers the full workflow from project creation to reconciliation tracking.",
    category: "nexus-101",
    lastUpdated: "February 2026",
    path: "/learning/bkm/csv-import-reconciliation",
    status: "published",
  },
  {
    id: "BKM-NCC-002",
    title: "Dev Stack & Environment Guide",
    description:
      "How to start and manage local development environments: Docker, Cloud SQL, and the three startup scripts.",
    category: "nexus-101",
    lastUpdated: "February 2026",
    path: "/learning/bkm/dev-stack",
    status: "published",
  },
  {
    id: "BKM-NCC-003",
    title: "Daily Workflow for Field Staff",
    description:
      "Day-to-day operations guide for field team members: logging work, updating progress, and communicating status.",
    category: "nexus-101",
    lastUpdated: "February 2026",
    path: "/learning/bkm/daily-workflow-field",
    status: "coming-soon",
  },

  // Project Delivery
  {
    id: "BKM-PDL-001",
    title: "Project Kickoff Checklist",
    description:
      "Standard checklist for starting a new project: scope review, team assignment, system setup, and client communication.",
    category: "project-delivery",
    lastUpdated: "February 2026",
    path: "/learning/bkm/project-kickoff",
    status: "coming-soon",
  },
  {
    id: "BKM-PDL-002",
    title: "Progress Tracking and Reporting",
    description:
      "How to track project progress, update % complete, generate reports, and communicate status to stakeholders.",
    category: "project-delivery",
    lastUpdated: "February 2026",
    path: "/learning/bkm/progress-tracking",
    status: "coming-soon",
  },
  {
    id: "BKM-PDL-003",
    title: "Change Order Management",
    description:
      "Standard process for handling scope changes: documentation, pricing, approval workflow, and reconciliation.",
    category: "project-delivery",
    lastUpdated: "February 2026",
    path: "/learning/bkm/change-orders",
    status: "coming-soon",
  },

  // Inventory & Materials
  {
    id: "BKM-INV-001",
    title: "Inventory and Forecasting SOP",
    description:
      "Complete guide to asset tracking, inventory positions, material forecasting, and PETL-driven consumption workflows.",
    category: "inventory-materials",
    lastUpdated: "February 2026",
    path: "/learning/bkm/inventory-forecasting",
    status: "published",
  },
  {
    id: "BKM-INV-002",
    title: "Material Requirements Planning",
    description:
      "How to use MaterialRequirement records to plan orders, track lead times, and ensure materials arrive on time.",
    category: "inventory-materials",
    lastUpdated: "February 2026",
    path: "/learning/bkm/material-requirements",
    status: "coming-soon",
  },
  {
    id: "BKM-INV-003",
    title: "Purchase Order Workflow",
    description:
      "Creating, approving, and tracking purchase orders from forecast to delivery to inventory receipt.",
    category: "inventory-materials",
    lastUpdated: "February 2026",
    path: "/learning/bkm/purchase-orders",
    status: "coming-soon",
  },

  // Technical Standards
  {
    id: "BKM-TEC-001",
    title: "UI Performance Standards",
    description:
      "Performance guidelines for React/Next.js development: memoization, lazy loading, and profiling techniques.",
    category: "technical-standards",
    lastUpdated: "February 2026",
    path: "/learning/bkm/ui-performance",
    status: "published",
  },
  {
    id: "BKM-TEC-002",
    title: "Code Review Checklist",
    description:
      "Standard checklist for reviewing code changes: structure, performance, testing, and documentation.",
    category: "technical-standards",
    lastUpdated: "February 2026",
    path: "/learning/bkm/code-review",
    status: "coming-soon",
  },

  // Integrations & Data
  {
    id: "BKM-INT-001",
    title: "CSV Import Architecture",
    description:
      "Technical standard for building CSV-based imports: PETL pattern, job-based processing, and parallel chunking.",
    category: "integrations",
    lastUpdated: "February 2026",
    path: "/learning/bkm/csv-import-architecture",
    status: "published",
  },
  {
    id: "BKM-INT-002",
    title: "Xactimate Integration Guide",
    description:
      "Working with Xactimate exports: RAW vs Components CSVs, field mappings, and troubleshooting imports.",
    category: "integrations",
    lastUpdated: "February 2026",
    path: "/learning/bkm/xactimate-integration",
    status: "published",
  },
];

export default function BkmListPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const publishedCount = BKM_DOCUMENTS.filter((d) => d.status === "published").length;
  const totalCount = BKM_DOCUMENTS.length;

  // Filter documents based on search and category
  const filteredDocuments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    return BKM_DOCUMENTS.filter((doc) => {
      // Category filter
      if (selectedCategory && doc.category !== selectedCategory) {
        return false;
      }
      
      // Search filter
      if (query) {
        const searchableText = [
          doc.id,
          doc.title,
          doc.description,
          BKM_CATEGORIES.find((c) => c.id === doc.category)?.name || "",
        ]
          .join(" ")
          .toLowerCase();
        
        return searchableText.includes(query);
      }
      
      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Group filtered documents by category
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, BkmDocument[]> = {};
    for (const doc of filteredDocuments) {
      if (!groups[doc.category]) {
        groups[doc.category] = [];
      }
      groups[doc.category].push(doc);
    }
    return groups;
  }, [filteredDocuments]);

  const hasResults = filteredDocuments.length > 0;
  const isFiltering = searchQuery.trim() !== "" || selectedCategory !== null;

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => router.push("/learning")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← Learning
            </button>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Best Known Methods (BKMs)</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Proven patterns, playbooks, and procedures we rely on for consistent delivery.
          </p>
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              fontSize: 13,
              color: "#166534",
            }}
          >
            📚 <strong>{publishedCount}</strong> published | <strong>{totalCount - publishedCount}</strong> in development
          </div>
        </header>

        {/* Search Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search BKMs by title, description, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                outline: "none",
                backgroundColor: "#ffffff",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
            />
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter + Quick Jump */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 999,
                border: selectedCategory === null ? "1px solid #2563eb" : "1px solid #d1d5db",
                backgroundColor: selectedCategory === null ? "#eff6ff" : "#ffffff",
                color: selectedCategory === null ? "#2563eb" : "#374151",
                cursor: "pointer",
                fontWeight: selectedCategory === null ? 600 : 400,
              }}
            >
              All Categories
            </button>
            {BKM_CATEGORIES.map((cat) => {
              const count = BKM_DOCUMENTS.filter((d) => d.category === cat.id).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCategory(null);
                    } else {
                      setSelectedCategory(cat.id);
                      // Also scroll to category if not searching
                      if (!searchQuery) {
                        const el = document.getElementById(`cat-${cat.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    border: isSelected ? "1px solid #2563eb" : "1px solid #d1d5db",
                    backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                    color: isSelected ? "#2563eb" : "#374151",
                    cursor: "pointer",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {cat.name.split(" — ")[0]} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Results Info */}
          {isFiltering && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: hasResults ? "#eff6ff" : "#fef3c7",
                border: `1px solid ${hasResults ? "#bfdbfe" : "#fcd34d"}`,
                borderRadius: 6,
                fontSize: 13,
                color: hasResults ? "#1e40af" : "#92400e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {hasResults
                  ? `Found ${filteredDocuments.length} document${filteredDocuments.length !== 1 ? "s" : ""}`
                  : "No documents match your search"}
                {searchQuery && ` for "${searchQuery}"`}
                {selectedCategory && ` in ${BKM_CATEGORIES.find((c) => c.id === selectedCategory)?.name.split(" — ")[0]}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: hasResults ? "#2563eb" : "#92400e",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Categories with filtered documents */}
        {BKM_CATEGORIES.map((cat) => {
          const docs = groupedDocuments[cat.id] || [];
          if (docs.length === 0) return null;

          return (
            <section key={cat.id} id={`cat-${cat.id}`}>
              <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 17, color: "#111827" }}>
                {cat.name}
              </h2>
              <p style={{ marginTop: 0, marginBottom: 10, fontSize: 13, color: "#6b7280" }}>
                {cat.description}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {docs.map((doc) => (
                  <BkmCard
                    key={doc.id}
                    document={doc}
                    searchQuery={searchQuery}
                    onClick={
                      doc.status === "published" ? () => router.push(doc.path) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* No results fallback */}
        {!hasResults && isFiltering && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#6b7280",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
              No BKMs found
            </div>
            <div style={{ fontSize: 14 }}>
              Try adjusting your search or category filter
            </div>
          </div>
        )}
      </div>
    </PageCard>
  );
}

interface BkmCardProps {
  document: BkmDocument;
  searchQuery?: string;
  onClick?: () => void;
}

function BkmCard({ document, searchQuery, onClick }: BkmCardProps) {
  const isComingSoon = document.status === "coming-soon";

  return (
    <div
      style={{
        borderRadius: 8,
        border: isComingSoon ? "1px dashed #d1d5db" : "1px solid #e5e7eb",
        backgroundColor: isComingSoon ? "#fafafa" : "#ffffff",
        padding: 14,
        cursor: isComingSoon ? "default" : "pointer",
        transition: "border-color 0.15s",
        opacity: isComingSoon ? 0.7 : 1,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isComingSoon) e.currentTarget.style.borderColor = "#2563eb";
      }}
      onMouseLeave={(e) => {
        if (!isComingSoon) e.currentTarget.style.borderColor = "#e5e7eb";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {document.id}
            </span>
            {isComingSoon ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#9333ea",
                  backgroundColor: "#f3e8ff",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                COMING SOON
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                Updated {document.lastUpdated}
              </span>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: isComingSoon ? "#6b7280" : "#111827" }}>
            <HighlightText text={document.title} query={searchQuery} />
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
            <HighlightText text={document.description} query={searchQuery} />
          </p>
        </div>
        {!isComingSoon && (
          <span style={{ fontSize: 18, color: "#9ca3af", marginLeft: 12 }}>→</span>
        )}
      </div>
    </div>
  );
}

// Highlight matching text in search results
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || query.trim() === "") {
    return <>{text}</>;
  }

  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);

  if (index === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark
        style={{
          backgroundColor: "#fef08a",
          color: "inherit",
          padding: "0 2px",
          borderRadius: 2,
        }}
      >
        {match}
      </mark>
      <HighlightText text={after} query={query} />
    </>
  );
}
