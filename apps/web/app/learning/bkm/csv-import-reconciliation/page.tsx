"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function CsvImportReconciliationPage() {
  const router = useRouter();

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
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
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>CSV Import and Line Item Reconciliation</h1>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                backgroundColor: "#f3f4f6",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              BKM-NCC-001
            </span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              NEXUS 101 — Core Operations
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Updated February 2026</span>
          </div>
        </header>

        {/* Purpose */}
        <Section title="Purpose">
          <p>
            This document defines the standard operating procedure for importing insurance
            estimates into NEXUS and reconciling line items. It is intended for all team
            members who work with project estimates.
          </p>
          <p>
            <strong>Audience:</strong> Project Managers, Estimators, Field Staff, Administrators
          </p>
        </Section>

        {/* What You'll Learn */}
        <Section title="What You'll Learn">
          <p>By the end of this guide, you'll know how to:</p>
          <ol>
            <li>Create a project to hold your estimate</li>
            <li>Import a CSV file from Xactimate</li>
            <li>Review and reconcile individual line items</li>
            <li>Track your progress</li>
          </ol>
        </Section>

        {/* Before You Begin */}
        <Section title="Before You Begin">
          <p>
            <strong>You will need:</strong>
          </p>
          <ul>
            <li>A NEXUS account with Project Manager access or higher</li>
            <li>An Xactimate estimate exported as CSV (the "RAW" export)</li>
            <li>About 15 minutes for your first import</li>
          </ul>
          <Callout>
            Don't have an Xactimate CSV yet? You can still follow along — just skip the import
            step and explore an existing project.
          </Callout>
        </Section>

        {/* Step 1 */}
        <Section title="Step 1: Create a Project">
          <p>
            <em>You need somewhere to put your estimate. That's a Project.</em>
          </p>
          <p>
            <strong>What to do:</strong>
          </p>
          <ol>
            <li>Log into NEXUS</li>
            <li>
              Click <strong>Projects</strong> in the left menu
            </li>
            <li>
              Click the <strong>+ New Project</strong> button (top right)
            </li>
            <li>
              Fill in the basics:
              <ul>
                <li>
                  <strong>Project Name</strong> — Something descriptive (e.g., "Smith Residence -
                  Water Damage")
                </li>
                <li>
                  <strong>Address</strong> — The property address
                </li>
                <li>
                  <strong>Client</strong> — Select or create the client
                </li>
              </ul>
            </li>
            <li>
              Click <strong>Create Project</strong>
            </li>
          </ol>
          <Callout type="success">
            NEXUS creates an empty project. You'll see it in your project list. Now you have a
            container for your estimate.
          </Callout>
        </Section>

        {/* Step 2 */}
        <Section title="Step 2: Export Your Estimate from Xactimate">
          <p>
            <em>NEXUS reads CSV files exported from Xactimate. Here's how to get one.</em>
          </p>
          <p>
            <strong>What to do in Xactimate:</strong>
          </p>
          <ol>
            <li>Open your estimate in Xactimate</li>
            <li>
              Go to <strong>Reports</strong> → <strong>Export</strong>
            </li>
            <li>
              Select <strong>CSV</strong> format
            </li>
            <li>
              Choose the <strong>Line Items (RAW)</strong> export type
            </li>
            <li>Save the file to your computer</li>
          </ol>
          <p>
            <strong>What you'll have:</strong> A <code>.csv</code> file with all your line items
            — descriptions, quantities, costs, and RCV values.
          </p>
          <Callout>
            <strong>Optional:</strong> If you also want component-level detail, export the{" "}
            <strong>Components</strong> CSV too.
          </Callout>
        </Section>

        {/* Step 3 */}
        <Section title="Step 3: Import the CSV into NEXUS">
          <p>
            <em>This is where the magic happens. Your spreadsheet becomes a structured estimate.</em>
          </p>
          <p>
            <strong>What to do:</strong>
          </p>
          <ol>
            <li>Open your project in NEXUS</li>
            <li>
              Click the <strong>Import</strong> tab (or go to Projects → Import)
            </li>
            <li>Make sure your project is selected in the dropdown</li>
            <li>
              Under <strong>"Xactimate RAW CSV"</strong>, click <strong>Choose File</strong>
            </li>
            <li>Select the CSV you exported from Xactimate</li>
            <li>
              Click <strong>Import RAW CSV</strong>
            </li>
          </ol>
          <p>
            <strong>What happens:</strong>
          </p>
          <ul>
            <li>You'll see a progress bar while the file uploads</li>
            <li>
              A "Job Console" window shows real-time status:
              <pre
                style={{
                  background: "#1f2937",
                  color: "#d1d5db",
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  overflow: "auto",
                }}
              >
                {`[10:30:15] Job queued
[10:30:17] Processing rows 1-500...
[10:30:42] Processing rows 501-847...
[10:30:58] Import completed successfully`}
              </pre>
            </li>
            <li>
              When finished, you're taken to the <strong>PETL tab</strong> (your line item list)
            </li>
          </ul>
          <Callout>
            <strong>How long does it take?</strong> Small estimates (under 500 lines): 30
            seconds. Large estimates (2000+ lines): 2-3 minutes.
          </Callout>
        </Section>

        {/* Step 4 */}
        <Section title="Step 4: Review Your Line Items">
          <p>
            <em>Your estimate is now in NEXUS. Let's make sure it looks right.</em>
          </p>
          <p>
            <strong>What to do:</strong>
          </p>
          <ol>
            <li>
              You should already be on the <strong>PETL</strong> tab
            </li>
            <li>Scroll through the list — each row is one line item from your estimate</li>
            <li>
              Spot-check a few items:
              <ul>
                <li>Do the descriptions look right?</li>
                <li>Are quantities and costs correct?</li>
                <li>Do the RCV totals match your Xactimate report?</li>
              </ul>
            </li>
          </ol>

          <p>
            <strong>Understanding the display:</strong>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
                  Column
                </th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
                  What it shows
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Line", "The line number from your estimate"],
                ["Room", "Which room/area this item belongs to"],
                ["Task", "The description of the work"],
                ["Qty", "Quantity (e.g., 150 SF)"],
                ["Unit", "Unit of measure (SF, LF, EA, etc.)"],
                ["Total", "Line item total cost"],
                ["RCV", "Replacement Cost Value"],
                ["%", "Percent complete (starts at 0%)"],
              ].map(([col, desc]) => (
                <tr key={col}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb", fontWeight: 500 }}>
                    {col}
                  </td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: 12 }}>
            <strong>Visual cues:</strong>
          </p>
          <ul>
            <li>
              <span style={{ color: "#2563eb" }}>■</span> <strong>Blue rows</strong> = This item
              has reconciliation activity
            </li>
            <li>
              <span style={{ color: "#ca8a04" }}>■</span> <strong>Yellow rows</strong> = This item
              is flagged for review
            </li>
            <li>
              <strong>▸ Arrow</strong> = Click to expand and see sub-entries
            </li>
          </ul>
        </Section>

        {/* Step 5 */}
        <Section title="Step 5: Reconcile a Line Item">
          <p>
            <em>This is where you track changes — credits, supplements, notes, and progress.</em>
          </p>

          <h4 style={{ marginTop: 16, marginBottom: 8 }}>Opening the Reconciliation Panel</h4>
          <ol>
            <li>Find a line item you want to work on</li>
            <li>
              Click the <strong>Reconcile</strong> button on that row
            </li>
            <li>A panel slides open on the right side</li>
          </ol>

          <h4 style={{ marginTop: 16, marginBottom: 8 }}>What You Can Do</h4>

          <p>
            <strong>Add a Credit</strong> (when actual cost is less than estimated)
          </p>
          <ol>
            <li>Review the RCV breakdown shown</li>
            <li>Check which components to credit (Item, Tax, O&P)</li>
            <li>Type a note explaining why (e.g., "Used existing materials")</li>
            <li>
              Click <strong>Create Credit</strong>
            </li>
          </ol>

          <p>
            <strong>Add a Supplement</strong> (when you need to add work)
          </p>
          <ol>
            <li>
              Click <strong>Open Cost Book</strong>
            </li>
            <li>Search for the item you need to add</li>
            <li>Enter the quantity</li>
            <li>
              Click <strong>Add to Reconciliation</strong>
            </li>
          </ol>

          <p>
            <strong>Add a Note</strong> (to document something without changing $)
          </p>
          <ol>
            <li>Type your note in the Note field</li>
            <li>Select a tag if applicable (Supplement, Change Order, etc.)</li>
            <li>
              Click <strong>Add Placeholder</strong>
            </li>
          </ol>

          <p>
            <strong>Update % Complete</strong>
          </p>
          <ol>
            <li>
              Click the <strong>%</strong> column on any line item
            </li>
            <li>Select the new percentage (0%, 10%, 20%... 100%)</li>
            <li>It saves automatically</li>
          </ol>

          <Callout type="success">
            Click <strong>Save</strong> to close the panel (or <strong>Cancel</strong> to
            discard changes).
          </Callout>
        </Section>

        {/* Summary */}
        <Section title="That's It!">
          <p>You've just:</p>
          <ul>
            <li>✅ Created a project</li>
            <li>✅ Imported an Xactimate estimate</li>
            <li>✅ Reviewed your line items</li>
            <li>✅ Reconciled an item</li>
          </ul>
          <p>
            <strong>Next steps:</strong>
          </p>
          <ul>
            <li>Work through your line items, updating % complete as work finishes</li>
            <li>Add credits or supplements as the scope changes</li>
            <li>Use filters to focus on specific rooms or categories</li>
          </ul>
        </Section>

        {/* Quick Reference */}
        <Section title="Quick Reference">
          <h4 style={{ marginTop: 0, marginBottom: 8 }}>Key Terms</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {[
                ["PETL", "Your line item list (Project Estimate Task List)"],
                ["RCV", "Replacement Cost Value — the full cost before depreciation"],
                ["Reconciliation", "Tracking changes to a line item (credits, adds, notes)"],
                ["Credit", "Money coming off a line item"],
                ["Supplement", "Additional work being added"],
              ].map(([term, desc]) => (
                <tr key={term}>
                  <td
                    style={{
                      padding: "6px 10px",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 600,
                      width: 140,
                    }}
                  >
                    {term}
                  </td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16, marginBottom: 8 }}>Common Tasks</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {[
                ["Find a specific line item", "Use the search/filter at the top"],
                ["See only items I've worked on", 'Click "Reconciliation only" view'],
                ["Flag something for later", 'Click the "Flag" button on the row'],
                ["See the history of changes", "Open Reconcile → scroll to History"],
                ["Re-import an updated estimate", "Go to Import tab → upload new CSV"],
              ].map(([task, action]) => (
                <tr key={task}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    {task}
                  </td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    {action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Troubleshooting */}
        <Section title="Troubleshooting">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  Problem
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  Solution
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Import fails",
                  "Check that your CSV is UTF-8 encoded. Open in a text editor and re-save if needed.",
                ],
                [
                  "Missing line items",
                  'They might be filtered out. Click "Clear filters" or "Show all".',
                ],
                [
                  "Can't edit a field",
                  "You need Project Manager access or higher. Check with your admin.",
                ],
                [
                  "% Complete won't save",
                  "Make sure you clicked off the field. Try refreshing the page.",
                ],
                [
                  "Reconciliation entries missing",
                  'If you re-imported, check "Orphaned entries" at the top.',
                ],
              ].map(([problem, solution]) => (
                <tr key={problem}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    {problem}
                  </td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    {solution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Team Roles */}
        <Section title="Team Roles">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {[
                ["Project Manager", "Create projects, import estimates, initial review"],
                ["Estimator", "Reconcile line items, add credits/supplements"],
                ["Field Staff", "Update % complete as work finishes"],
                ["Admin", "Approve changes, review orphaned entries, QA"],
              ].map(([role, tasks]) => (
                <tr key={role}>
                  <td
                    style={{
                      padding: "6px 10px",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 600,
                      width: 160,
                    }}
                  >
                    {role}
                  </td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #e5e7eb" }}>
                    {tasks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            <strong>Document ID:</strong> BKM-NCC-001 | <strong>Owner:</strong> Operations Team |{" "}
            <strong>Review Cycle:</strong> Quarterly
          </p>
        </footer>
      </div>
    </PageCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18, color: "#111827" }}>{title}</h2>
      <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}

function Callout({
  children,
  type = "info",
}: {
  children: React.ReactNode;
  type?: "info" | "success";
}) {
  const colors = {
    info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  };
  const c = colors[type];

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 6,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        fontSize: 13,
        marginTop: 10,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}
