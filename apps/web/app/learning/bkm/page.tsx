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
}

const BKM_DOCUMENTS: BkmDocument[] = [
  {
    id: "BKM-NCC-001",
    title: "CSV Import and Line Item Reconciliation",
    description:
      "Standard operating procedure for importing Xactimate estimates and reconciling line items in NEXUS. Covers the full workflow from project creation to reconciliation tracking.",
    category: "NEXUS 101 — Core Operations",
    lastUpdated: "February 2026",
    path: "/learning/bkm/csv-import-reconciliation",
  },
];

export default function BkmListPage() {
  const router = useRouter();

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        </header>

        {/* Category: NEXUS 101 */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16, color: "#111827" }}>
            NEXUS 101 — Core Operations
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BKM_DOCUMENTS.filter((doc) => doc.category.includes("NEXUS 101")).map((doc) => (
              <BkmCard key={doc.id} document={doc} onClick={() => router.push(doc.path)} />
            ))}
          </div>
        </section>

        {/* Placeholder for future categories */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16, color: "#111827" }}>
            More Coming Soon
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Additional BKMs for project delivery, quality standards, and client communication
            are in development.
          </p>
        </section>
      </div>
    </PageCard>
  );
}

interface BkmCardProps {
  document: BkmDocument;
  onClick: () => void;
}

function BkmCard({ document, onClick }: BkmCardProps) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        padding: 14,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
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
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              Updated {document.lastUpdated}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>
            {document.title}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
            {document.description}
          </p>
        </div>
        <span style={{ fontSize: 18, color: "#9ca3af", marginLeft: 12 }}>→</span>
      </div>
    </div>
  );
}
