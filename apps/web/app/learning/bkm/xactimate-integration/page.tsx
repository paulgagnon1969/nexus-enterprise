"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function XactimateIntegrationBkmPage() {
  const router = useRouter();

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => router.push("/learning/bkm")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← BKMs
            </button>
            <span style={{ color: "#9ca3af" }}>|</span>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BKM-INT-002</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Xactimate Integration Guide</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Working with Xactimate exports: RAW vs Components CSVs, field mappings, and the import workflow.
          </p>
        </header>

        {/* Overview */}
        <Section title="Overview">
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            NEXUS imports Xactimate estimate data through two CSV files that work together:
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <CsvTypeCard
              type="RAW"
              title="Estimate Line Items"
              description="Main estimate lines with Cat/Sel, descriptions, quantities, and pricing"
              importOrder="1st"
            />
            <CsvTypeCard
              type="Components"
              title="Component Breakdown"
              description="Material, labor, and equipment details for each line item"
              importOrder="2nd"
            />
          </div>
        </Section>

        {/* Import Flow */}
        <Section title="Import Flow: End-to-End">
          <FlowDiagram />
        </Section>

        {/* RAW CSV */}
        <Section title="RAW CSV Import">
          <SubSection title="What it creates">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><strong>EstimateVersion</strong> — a versioned snapshot of the estimate</li>
              <li><strong>RawXactRow</strong> — one row per CSV line (raw data preservation)</li>
              <li><strong>SOW (Scope of Work)</strong> — the work breakdown structure</li>
              <li><strong>SowItem</strong> — individual tasks/line items linked to particles</li>
              <li><strong>Particle</strong> — room/location references</li>
            </ul>
          </SubSection>

          <SubSection title="Key field mappings">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <MappingRow csv="Cat" db="category" note="Xactimate category code" />
              <MappingRow csv="Sel" db="selector" note="Xactimate selector code" />
              <MappingRow csv="Description" db="description" note="Line item description" />
              <MappingRow csv="Qty" db="quantity" note="Quantity value" />
              <MappingRow csv="Unit" db="unit" note="Unit of measure (SF, LF, EA, etc.)" />
              <MappingRow csv="Unit Cost" db="unitPrice" note="Price per unit" />
              <MappingRow csv="RCV" db="rcvTotal" note="Replacement Cost Value" />
              <MappingRow csv="Depreciation" db="depreciation" note="Depreciation amount" />
              <MappingRow csv="ACV" db="acvTotal" note="Actual Cash Value (RCV - Dep)" />
              <MappingRow csv="Room" db="particleName" note="Links to Location/Particle" />
            </div>
          </SubSection>

          <SubSection title="Processing steps">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Create <code>EstimateVersion</code> with <code>status: "parsing"</code></li>
              <li>Parse CSV using <code>csv-parse/sync</code></li>
              <li>Bulk insert <code>RawXactRow</code> records</li>
              <li>Create/lookup <code>Particle</code> records for each room</li>
              <li>Create <code>SOW</code> and bulk insert <code>SowItem</code> rows</li>
              <li>Compute totals and update <code>EstimateVersion</code> + <code>SOW</code></li>
              <li>Optionally update Golden price list via <code>updateGoldenFromEstimate</code></li>
            </ol>
          </SubSection>
        </Section>

        {/* Components CSV */}
        <Section title="Components CSV Import">
          <SubSection title="What it creates">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><strong>RawComponentRow</strong> — one row per CSV line (raw preservation)</li>
              <li><strong>ComponentSummary</strong> — aggregated by (SowItem, Component Code)</li>
              <li>Links components to existing <code>SowItem</code> records from RAW import</li>
            </ul>
          </SubSection>

          <SubSection title="Key field mappings">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <MappingRow csv="Cat" db="category" note="Must match RAW line item" />
              <MappingRow csv="Sel" db="selector" note="Must match RAW line item" />
              <MappingRow csv="Activity" db="activity" note="Line item activity/scope" />
              <MappingRow csv="Component Code" db="componentCode" note="Unique component identifier" />
              <MappingRow csv="Component Description" db="componentDescription" note="Material/labor/equipment name" />
              <MappingRow csv="Component Type" db="componentType" note="MATERIAL, LABOR, EQUIPMENT" />
              <MappingRow csv="Qty" db="quantity" note="Component quantity" />
              <MappingRow csv="Unit Cost" db="unitCost" note="Component unit price" />
            </div>
          </SubSection>

          <SubSection title="Processing steps (chunked)">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Resolve <code>EstimateVersion</code> (from RAW import)</li>
              <li>Wipe prior component data for that estimate version</li>
              <li>Parse full CSV to plan chunking strategy</li>
              <li>Write chunk CSVs to temp directory</li>
              <li>Enqueue chunk jobs (parallel processing)</li>
              <li>Each chunk: parse → create <code>RawComponentRow</code> + <code>ComponentSummary</code></li>
              <li>On completion: run allocation job to link components to SowItems</li>
            </ol>
          </SubSection>
        </Section>

        {/* UI Workflow */}
        <Section title="User Workflow in NEXUS">
          <SubSection title="Import page: /projects/import">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Select a project from the dropdown</li>
              <li><strong>Step 1:</strong> Upload the RAW CSV (estimate line items)</li>
              <li>Wait for import job to complete (progress bar + script window)</li>
              <li><strong>Step 2:</strong> Upload the Components CSV (optional but recommended)</li>
              <li>Wait for components import + allocation jobs</li>
              <li>Navigate to project PETL tab to review imported data</li>
            </ol>
          </SubSection>

          <SubSection title="Job status polling">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              The UI polls <code>/import-jobs/:jobId</code> every ~1.5 seconds to show:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Status: QUEUED → RUNNING → SUCCEEDED / FAILED</li>
              <li>Progress: 0–100%</li>
              <li>Message: current operation description</li>
              <li>Script window: log lines for visibility into worker progress</li>
            </ul>
          </SubSection>
        </Section>

        {/* Troubleshooting */}
        <Section title="Troubleshooting">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <TroubleshootCard
              problem="Components import fails with 'missing estimateVersionId'"
              solution="Import the RAW CSV first. Components need an existing estimate to attach to."
            />
            <TroubleshootCard
              problem="Line items don't match between RAW and Components"
              solution="Ensure Cat/Sel/Activity match exactly between both CSVs. Check for whitespace or encoding issues."
            />
            <TroubleshootCard
              problem="Import stuck at 'Waiting for worker...'"
              solution="Check that the API worker is running (npm run worker:dev). Verify Redis is accessible."
            />
            <TroubleshootCard
              problem="Large CSV times out"
              solution="The import uses chunked processing. Check worker logs for progress. Very large files (100k+ rows) may take several minutes."
            />
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: BKM-INT-002 | Category: Integrations & Data | Last Updated: February 2026
          </p>
        </footer>
      </div>
    </PageCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 600, color: "#111827" }}>{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#374151" }}>{title}</h3>
      {children}
    </div>
  );
}

function CsvTypeCard({ type, title, description, importOrder }: {
  type: string; title: string; description: string; importOrder: string;
}) {
  const isRaw = type === "RAW";
  return (
    <div style={{
      flex: 1,
      padding: 14,
      backgroundColor: isRaw ? "#f0fdf4" : "#eff6ff",
      border: `1px solid ${isRaw ? "#bbf7d0" : "#bfdbfe"}`,
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: isRaw ? "#166534" : "#1e40af" }}>{type}</span>
        <span style={{ fontSize: 11, color: "#6b7280", backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
          Import {importOrder}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#4b5563" }}>{description}</div>
    </div>
  );
}

function FlowDiagram() {
  const steps = [
    { label: "UI Upload", detail: "/projects/import form" },
    { label: "Next.js Route", detail: "Write CSV to temp, call API" },
    { label: "API Controller", detail: "Create ImportJob, enqueue" },
    { label: "BullMQ Worker", detail: "Process job (chunked)" },
    { label: "DB Helper", detail: "Parse CSV → Prisma writes" },
    { label: "Poll Status", detail: "UI shows progress" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", padding: "8px 0" }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            padding: "8px 12px",
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            minWidth: 100,
            textAlign: "center",
          }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#111827" }}>{step.label}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>{step.detail}</div>
          </div>
          {i < steps.length - 1 && (
            <span style={{ padding: "0 4px", color: "#9ca3af" }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MappingRow({ csv, db, note }: { csv: string; db: string; note: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}>
      <code style={{ minWidth: 140, fontWeight: 600, color: "#059669" }}>{csv}</code>
      <span style={{ color: "#9ca3af" }}>→</span>
      <code style={{ minWidth: 120, color: "#7c3aed" }}>{db}</code>
      <span style={{ color: "#6b7280", fontSize: 12 }}>{note}</span>
    </div>
  );
}

function TroubleshootCard({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div style={{ padding: 12, backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "#92400e", marginBottom: 4 }}>⚠️ {problem}</div>
      <div style={{ fontSize: 13, color: "#78350f" }}>{solution}</div>
    </div>
  );
}
