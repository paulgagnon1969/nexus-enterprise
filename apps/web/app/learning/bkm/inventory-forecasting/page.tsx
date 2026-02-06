"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function InventoryForecastingBkmPage() {
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
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BKM-INV-001</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Inventory and Forecasting SOP</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Complete guide to asset tracking, inventory positions, material forecasting, and PETL-driven consumption.
          </p>
        </header>

        {/* Quick Reference */}
        <QuickReference />

        {/* Core Concepts */}
        <Section title="1. Core Concepts">
          <SubSection title="Asset Types">
            <div style={{ display: "grid", gap: 8 }}>
              <ConceptCard
                term="MATERIAL"
                definition="Construction materials (studs, drywall, granite)"
              />
              <ConceptCard
                term="CONSUMABLE"
                definition="Items that are used up (sealant, fasteners)"
              />
              <ConceptCard
                term="EQUIPMENT_OWNED"
                definition="Company-owned equipment"
              />
              <ConceptCard
                term="EQUIPMENT_RENTAL"
                definition="Rented equipment (with rental contracts)"
              />
            </div>
          </SubSection>

          <SubSection title="Location Types">
            <div style={{ display: "grid", gap: 8 }}>
              <ConceptCard
                term="SITE / BUILDING / FLOOR / ROOM"
                definition="Physical project hierarchy"
              />
              <ConceptCard
                term="WAREHOUSE / YARD / STORAGE"
                definition="Storage and staging areas"
              />
              <ConceptCard
                term="SUPPLIER"
                definition="Material suppliers (yard, fabricator, distributor)"
              />
              <ConceptCard
                term="TRANSIT"
                definition="Logical 'in transit' legs (Supplier → Project)"
              />
              <ConceptCard
                term="LOGICAL"
                definition="Special endpoints (INSTALLED, CONSUMED)"
              />
            </div>
            <Callout type="info">
              <strong>Invariant:</strong> Every non-EOL asset/material is always "somewhere" via a Location.
            </Callout>
          </SubSection>

          <SubSection title="InventoryPosition (QTY + Dollars)">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              For each <code>(company, itemType, itemId, location)</code>, NEXUS keeps:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><strong>quantity</strong> — how many units at this location</li>
              <li><strong>totalCost</strong> — total inventory value at this location</li>
              <li><strong>unitCost</strong> = totalCost / quantity (derived)</li>
            </ul>
            <Callout type="success">
              InventoryPosition is the source of truth for "how much do we have here and what is it worth?"
            </Callout>
          </SubSection>
        </Section>

        {/* Costing Semantics */}
        <Section title="2. Inventory Movement & Costing">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>
            When moving <strong>q</strong> units from Location A → Location B:
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Compute <code>unitCostFrom = posA.totalCost / posA.quantity</code></li>
            <li>Calculate baseline: <code>movedCostBase = unitCostFrom × q</code></li>
            <li>Decrement source: <code>posA.quantity -= q</code>, <code>posA.totalCost -= movedCostBase</code></li>
            <li>Increment destination: <code>posB.quantity += q</code>, <code>posB.totalCost += movedCostBase + transportCost</code></li>
            <li>New unit cost: <code>unitCostTo = posB.totalCost / posB.quantity</code></li>
          </ol>

          <div style={{ marginTop: 16, padding: 14, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Capitalization Rule (v1)</h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
              <li><strong>External transport cost</strong> → capitalized into inventory</li>
              <li><strong>Internal labor cost</strong> → recorded on movement for reporting, NOT added to totalCost</li>
            </ul>
          </div>

          <Callout type="warning">
            <strong>Rule:</strong> No direct edits to positions or current location without a movement. All changes flow through InventoryMovement.
          </Callout>
        </Section>

        {/* Day-to-Day Operations */}
        <Section title="3. Day-to-Day Operations">
          <SubSection title="Creating Materials & Suppliers">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Define material items on Company Price List</li>
              <li>
                For each material + supplier pair, create a <strong>SupplierItem</strong> with:
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>avgLeadTimeDays, p80LeadTimeDays, (optional p95LeadTimeDays)</li>
                  <li>shippingDays, internalBufferDays</li>
                  <li>minOrderQty (optional)</li>
                </ul>
              </li>
              <li>
                Define project Locations:
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>Project storage (WAREHOUSE/STORAGE)</li>
                  <li>Rooms/particles (ROOM)</li>
                  <li>Supplier yards (SUPPLIER)</li>
                  <li>Transit legs (TRANSIT) when needed</li>
                </ul>
              </li>
            </ol>
          </SubSection>

          <SubSection title="Receiving Materials">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              When materials arrive from a supplier:
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>
                Create an <strong>InventoryMovement</strong>:
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>fromLocationId = SUPPLIER</li>
                  <li>toLocationId = project warehouse/staging</li>
                  <li>quantity = receivedQty</li>
                  <li>transportCost = freight/delivery from BOM or invoice</li>
                </ul>
              </li>
              <li>System updates InventoryPositions and computes new unitCost (landed cost)</li>
            </ol>
          </SubSection>

          <SubSection title="Installation & Consumption">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: 12, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#166534" }}>Materials (Installed)</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
                  <li>Movement from storage → room → installed uses <code>reason = INSTALL</code></li>
                  <li>Mark material usage as <code>eolStatus = MATERIAL_EOL</code></li>
                </ul>
              </div>
              <div style={{ padding: 12, backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6 }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#92400e" }}>Consumables (Used Up)</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
                  <li>Move to CONSUMED logical location OR decrement directly</li>
                  <li>Mark as <code>eolStatus = CONSUMABLE_EOL</code></li>
                  <li>Record AssetTransaction (kind = CONSUME)</li>
                </ul>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* PETL-Driven Consumption */}
        <Section title="4. PETL-Driven Consumption">
          <Callout type="info">
            <strong>Principle:</strong> PETL completion drives actual material consumption. Inventory follows PETL.
          </Callout>

          <SubSection title="Planning: Link Materials to SOW Items">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              When PETL/SOW is created or imported:
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>For each SowItem, identify material components (company price list items)</li>
              <li>
                Create <strong>AssetUsage</strong> per material:
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>assetId / material reference</li>
                  <li>sowItemId</li>
                  <li>plannedQty</li>
                  <li>status = PLANNED</li>
                </ul>
              </li>
            </ol>
          </SubSection>

          <SubSection title="Task Completion Updates Inventory">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              When <code>SowItem.percentComplete</code> changes:
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Compute <code>targetConsumed = plannedQty × percentComplete</code></li>
              <li>Calculate <code>deltaToConsume = targetConsumed - consumedQtySoFar</code></li>
              <li>If deltaToConsume &gt; 0, call <code>consumeForSowItem(...)</code></li>
              <li>System moves material, updates positions, records AssetTransaction</li>
            </ol>
          </SubSection>
        </Section>

        {/* Forecasting */}
        <Section title="5. Forecasting & Date to Order">
          <SubSection title="Inputs">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><strong>SOW/PETL schedule:</strong> plannedTaskStartDate (+ optional end date)</li>
              <li><strong>Supplier lead times:</strong> avgLeadTimeDays, p80LeadTimeDays, shippingDays, internalBufferDays</li>
              <li><strong>Work calendar:</strong> Working days & holidays for the project</li>
            </ul>
          </SubSection>

          <SubSection title="Computing Dates">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <FormulaCard
                step="1"
                title="Required-On-Site Date"
                formula="requiredOnSiteDate = taskStartDate - internalBufferDays"
                note="Using working-day arithmetic"
              />
              <FormulaCard
                step="2"
                title="Lead Time (Risk Level)"
                formula="Normal risk: p80LeadTimeDays | High risk: p95LeadTimeDays"
                note=""
              />
              <FormulaCard
                step="3"
                title="Total Lead Days"
                formula="totalLeadDays = leadTimeDays + shippingDays"
                note=""
              />
              <FormulaCard
                step="4"
                title="Date to Order"
                formula="dateToOrder = requiredOnSiteDate - totalLeadDays"
                note="Using working days on project calendar"
              />
            </div>
          </SubSection>

          <SubSection title="Net Quantity to Order">
            <div style={{ padding: 12, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}>
              <code style={{ display: "block", marginBottom: 8 }}>
                grossQty = plannedQty for the SOW line
              </code>
              <code style={{ display: "block", marginBottom: 8 }}>
                availableForThisRequirement = onHand - alreadyReserved + inbound
              </code>
              <code style={{ display: "block", color: "#059669", fontWeight: 600 }}>
                netQtyToOrder = max(0, grossQty - availableForThisRequirement)
              </code>
            </div>
          </SubSection>

          <SubSection title="Status Flags">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <StatusBadge status="PLANNED" description="dateToOrder in the future; not yet ordered" />
              <StatusBadge status="DUE_SOON" description="dateToOrder within next N working days" />
              <StatusBadge status="LATE" description="today > dateToOrder and requirement not covered" />
              <StatusBadge status="ORDERED" description="PO placed that covers netQtyToOrder" />
              <StatusBadge status="RECEIVED" description="inventory/inbound fully covers plannedQty" />
              <StatusBadge status="CANCELED" description="scope removed or alternative design decided" />
            </div>
          </SubSection>
        </Section>

        {/* Purchase Orders */}
        <Section title="6. Purchase Suggestions & POs">
          <SubSection title="Grouping Requirements into POs">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>
                For each <strong>(Project, Supplier)</strong>, select MaterialRequirement rows with:
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>status in (PLANNED, DUE_SOON, LATE)</li>
                  <li>netQtyToOrder &gt; 0</li>
                </ul>
              </li>
              <li>Group by similar dateToOrder (same week) and requiredOnSiteDate</li>
              <li>Generate draft PurchaseOrder with header + lines</li>
              <li>Link PO lines to MaterialRequirement rows, set status = ORDERED</li>
            </ol>
          </SubSection>

          <SubSection title="Closing the Loop on Receipt">
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Record InventoryMovement (supplier → project) with quantity and freight cost</li>
              <li>Update InventoryPosition (QTY + cost)</li>
              <li>Mark MaterialRequirement.status = RECEIVED once on-hand meets plannedQty</li>
            </ol>
          </SubSection>
        </Section>

        {/* Key Invariants */}
        <Section title="7. Key Invariants & Rules">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <RuleCard number={1} text="No move without destination—changes go through InventoryMovement with toLocationId" />
            <RuleCard number={2} text="InventoryPosition is authoritative for QTY + cost at each location" />
            <RuleCard number={3} text="Only external transport costs are capitalized into inventory" />
            <RuleCard number={4} text="Internal labor costs are captured on movements for reporting, not valuation" />
            <RuleCard number={5} text="PETL is the driver of material consumption; inventory follows PETL completion" />
            <RuleCard number={6} text="MaterialRequirement is the central planning artifact for forecasting" />
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: BKM-INV-001 | Category: Inventory & Materials | Last Updated: February 2026
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

function QuickReference() {
  return (
    <div style={{ padding: 14, backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Quick Reference</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>Track Materials</div>
          <div style={{ color: "#3b82f6" }}>InventoryPosition + InventoryMovement</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>Plan Requirements</div>
          <div style={{ color: "#3b82f6" }}>MaterialRequirement per SOW item</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>Drive Consumption</div>
          <div style={{ color: "#3b82f6" }}>PETL % complete → delta consumption</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "#1e3a8a" }}>Order Materials</div>
          <div style={{ color: "#3b82f6" }}>dateToOrder from lead times + calendar</div>
        </div>
      </div>
    </div>
  );
}

function ConceptCard({ term, definition }: { term: string; definition: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <code style={{ fontWeight: 600, color: "#7c3aed", minWidth: 180 }}>{term}</code>
      <span style={{ color: "#4b5563" }}>{definition}</span>
    </div>
  );
}

function Callout({ type, children }: { type: "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
    warning: { bg: "#fef3c7", border: "#fcd34d", color: "#92400e" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
  };
  const s = styles[type];
  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 6,
        fontSize: 13,
        color: s.color,
      }}
    >
      {children}
    </div>
  );
}

function FormulaCard({ step, title, formula, note }: { step: string; title: string; formula: string; note: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: 10, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6 }}>
      <span style={{ fontWeight: 700, color: "#2563eb", fontSize: 14 }}>{step}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{title}</div>
        <code style={{ fontSize: 12, color: "#059669" }}>{formula}</code>
        {note && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status, description }: { status: string; description: string }) {
  const colors: Record<string, string> = {
    PLANNED: "#6b7280",
    DUE_SOON: "#d97706",
    LATE: "#dc2626",
    ORDERED: "#2563eb",
    RECEIVED: "#059669",
    CANCELED: "#9ca3af",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <code style={{ fontWeight: 600, color: colors[status] || "#374151", minWidth: 90 }}>{status}</code>
      <span style={{ color: "#4b5563" }}>{description}</span>
    </div>
  );
}

function RuleCard({ number, text }: { number: number; text: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: 10, backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6 }}>
      <span style={{ fontWeight: 700, color: "#92400e", fontSize: 14 }}>{number}</span>
      <span style={{ fontSize: 13, color: "#78350f" }}>{text}</span>
    </div>
  );
}
