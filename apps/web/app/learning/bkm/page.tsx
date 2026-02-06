"use client";

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

  const publishedCount = BKM_DOCUMENTS.filter((d) => d.status === "published").length;
  const totalCount = BKM_DOCUMENTS.length;

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

        {/* Quick Jump */}
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 0",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          {BKM_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(`cat-${cat.id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 999,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                cursor: "pointer",
              }}
            >
              {cat.name}
            </button>
          ))}
        </nav>

        {/* Categories */}
        {BKM_CATEGORIES.map((cat) => {
          const docs = BKM_DOCUMENTS.filter((d) => d.category === cat.id);
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
                    onClick={
                      doc.status === "published" ? () => router.push(doc.path) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageCard>
  );
}

interface BkmCardProps {
  document: BkmDocument;
  onClick?: () => void;
}

function BkmCard({ document, onClick }: BkmCardProps) {
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
            {document.title}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
            {document.description}
          </p>
        </div>
        {!isComingSoon && (
          <span style={{ fontSize: 18, color: "#9ca3af", marginLeft: 12 }}>→</span>
        )}
      </div>
    </div>
  );
}
