"use client";

import Link from "next/link";
import { PageCard } from "../ui-shell";

export default function DocumentsHomePage() {
  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Documents</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
            Internal documents and templates (invoices, quotations, SOPs).
          </p>
        </header>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/documents/templates"
            style={{
              flex: "1 1 280px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#ffffff",
              textDecoration: "none",
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Templates</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Create and manage reusable HTML templates and print them to PDF.
            </div>
          </Link>

          <Link
            href="/documents/pnp"
            style={{
              flex: "1 1 280px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#ffffff",
              textDecoration: "none",
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Policies & Procedures</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              View and manage internal knowledge base articles, SOPs, and procedures.
            </div>
          </Link>
        </div>
      </div>
    </PageCard>
  );
}
