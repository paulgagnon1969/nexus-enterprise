"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function PpeRequirementsPage() {
  const router = useRouter();

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => router.push("/learning/safety")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← Safety Manual
            </button>
            <span style={{ color: "#9ca3af" }}>|</span>
            <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 500 }}>SAF-PPE-001</span>
            <span style={{ fontSize: 10, color: "#4b5563", backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
              29 CFR 1910.132-138
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>PPE Requirements & Selection</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Overview of required PPE by job task, selection criteria, and proper fit.
          </p>
        </header>

        {/* Purpose */}
        <Section title="Purpose">
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            Personal Protective Equipment (PPE) is the last line of defense against workplace hazards.
            This document establishes requirements for PPE selection, use, and maintenance to protect
            NEXUS team members from injury and illness on job sites.
          </p>
        </Section>

        {/* When PPE is Required */}
        <Section title="When PPE is Required">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            PPE must be used when engineering controls and administrative controls cannot
            adequately reduce hazard exposure. Before starting any task, complete a Job Hazard
            Analysis (JHA) to identify required PPE.
          </p>
          <AlertBox type="warning">
            <strong>OSHA Requirement:</strong> Employers must provide PPE at no cost to employees
            and ensure it is properly fitted.
          </AlertBox>
        </Section>

        {/* PPE Categories */}
        <Section title="PPE by Category">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PpeCategory
              icon="👁️"
              title="Eye & Face Protection"
              oshaRef="29 CFR 1910.133"
              items={[
                { ppe: "Safety glasses", when: "Default for all job sites with potential for flying debris, dust, or particles" },
                { ppe: "Safety goggles", when: "Chemical handling, grinding, high-velocity particles" },
                { ppe: "Face shield", when: "Cutting, grinding, chemical splash risk (wear with safety glasses)" },
                { ppe: "Welding helmet", when: "Arc welding, cutting operations (appropriate shade lens required)" },
              ]}
              selectionTips={[
                "Must meet ANSI Z87.1 standard (look for Z87+ marking)",
                "Side shields required for impact hazards",
                "Prescription safety glasses available through NEXUS benefits",
              ]}
            />

            <PpeCategory
              icon="🪖"
              title="Head Protection"
              oshaRef="29 CFR 1910.135"
              items={[
                { ppe: "Type I hard hat", when: "Protection from top impacts (standard construction)" },
                { ppe: "Type II hard hat", when: "Protection from top and side impacts (elevated fall risk)" },
                { ppe: "Bump cap", when: "Low-clearance areas only (NOT a substitute for hard hat)" },
              ]}
              selectionTips={[
                "Must meet ANSI Z89.1 standard",
                "Class E (electrical) rated for work near electrical hazards",
                "Replace immediately if cracked, dented, or after significant impact",
                "Replace per manufacturer guidelines (typically 2-5 years)",
              ]}
            />

            <PpeCategory
              icon="🧤"
              title="Hand Protection"
              oshaRef="29 CFR 1910.138"
              items={[
                { ppe: "Leather work gloves", when: "General handling, rough materials, moderate heat" },
                { ppe: "Cut-resistant gloves", when: "Sharp materials, glass, metal edges (check ANSI cut level)" },
                { ppe: "Chemical-resistant gloves", when: "Chemical handling (match glove material to chemical)" },
                { ppe: "Insulated gloves", when: "Electrical work (voltage-rated, inspected before each use)" },
                { ppe: "Disposable nitrile gloves", when: "Light chemical contact, paint, adhesives" },
              ]}
              selectionTips={[
                "Select gloves matched to the specific hazard",
                "Check for cuts, tears, or punctures before use",
                "Chemical gloves: verify compatibility with SDS chemical resistance chart",
                "Electrical gloves: must be tested per OSHA requirements",
              ]}
            />

            <PpeCategory
              icon="👢"
              title="Foot Protection"
              oshaRef="29 CFR 1910.136"
              items={[
                { ppe: "Steel-toe boots", when: "Default for construction and warehouse environments" },
                { ppe: "Composite-toe boots", when: "Electrical hazard areas (non-conductive)" },
                { ppe: "Metatarsal guards", when: "Heavy material handling, demolition" },
                { ppe: "Puncture-resistant soles", when: "Sites with nails, screws, or sharp debris" },
              ]}
              selectionTips={[
                "Must meet ASTM F2413 standard",
                "EH (Electrical Hazard) rated boots required near electrical work",
                "Slip-resistant soles recommended for all job sites",
                "Replace when worn, damaged, or sole separation occurs",
              ]}
            />

            <PpeCategory
              icon="👂"
              title="Hearing Protection"
              oshaRef="29 CFR 1910.95"
              items={[
                { ppe: "Foam earplugs (NRR 29-33)", when: "Noise levels 85-100 dB (power tools, equipment)" },
                { ppe: "Earmuffs (NRR 22-31)", when: "Intermittent high noise, easier on/off" },
                { ppe: "Dual protection", when: "Noise levels >100 dB (combine earplugs + earmuffs)" },
              ]}
              selectionTips={[
                "NRR (Noise Reduction Rating) indicates protection level",
                "Proper insertion critical for earplug effectiveness",
                "Consider communication needs (radio-compatible earmuffs available)",
              ]}
            />

            <PpeCategory
              icon="🦺"
              title="High-Visibility Apparel"
              oshaRef="ANSI/ISEA 107"
              items={[
                { ppe: "Class 2 vest", when: "Work near vehicle traffic, equipment operations" },
                { ppe: "Class 3 vest/jacket", when: "Roadway work, low-light conditions, flagging" },
              ]}
              selectionTips={[
                "Select class based on traffic speed and work environment",
                "Must have both fluorescent background and retroreflective stripes",
                "Replace when faded, torn, or reflective material is damaged",
              ]}
            />
          </div>
        </Section>

        {/* PPE Inspection */}
        <Section title="PPE Inspection & Maintenance">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <InspectionItem
              title="Before Each Use"
              items={[
                "Visually inspect for damage, wear, or contamination",
                "Check straps, buckles, and adjustment mechanisms",
                "Verify proper fit",
                "Do NOT use damaged PPE—remove from service immediately",
              ]}
            />
            <InspectionItem
              title="Cleaning & Storage"
              items={[
                "Clean per manufacturer instructions",
                "Store in clean, dry location away from UV exposure",
                "Do not modify or alter PPE",
                "Keep away from chemicals and extreme temperatures",
              ]}
            />
            <InspectionItem
              title="Replacement"
              items={[
                "Replace immediately if damaged or after significant impact",
                "Follow manufacturer replacement guidelines",
                "Document PPE issuance and replacement in project records",
              ]}
            />
          </div>
        </Section>

        {/* Minimum Site Requirements */}
        <Section title="Minimum Site Requirements">
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#991b1b" }}>
              All NEXUS Job Sites (Minimum)
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Safety glasses with side shields</li>
              <li>Hard hat (Type I minimum)</li>
              <li>Work gloves appropriate to task</li>
              <li>Steel/composite toe boots</li>
              <li>High-visibility vest (Class 2 minimum)</li>
            </ul>
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#991b1b" }}>
              <strong>Note:</strong> Client sites may have additional requirements. Always follow
              the most stringent applicable standard.
            </p>
          </div>
        </Section>

        {/* Training */}
        <Section title="Training Requirements">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <li>All employees must complete PPE awareness training before site work</li>
            <li>Task-specific PPE training required for specialized equipment</li>
            <li>Retraining required when new PPE is introduced or when deficiencies are observed</li>
            <li>Training must cover: when PPE is necessary, what PPE is required, how to properly don/doff, limitations, and care/maintenance</li>
          </ul>
        </Section>

        {/* Related Documents */}
        <Section title="Related Documents">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <RelatedDoc id="SAF-PPE-002" title="Respiratory Protection Program" />
            <RelatedDoc id="SAF-PPE-003" title="Hearing Conservation" />
            <RelatedDoc id="SAF-GEN-003" title="Job Hazard Analysis (JHA)" />
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: SAF-PPE-001 | Category: Personal Protective Equipment | OSHA Reference: 29 CFR 1910.132-138 | Last Updated: February 2026
          </p>
        </footer>
      </div>
    </PageCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, color: "#111827" }}>{title}</h2>
      {children}
    </section>
  );
}

function AlertBox({ type, children }: { type: "warning" | "info"; children: React.ReactNode }) {
  const colors = {
    warning: { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
    info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  };
  const c = colors[type];

  return (
    <div
      style={{
        padding: 12,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        fontSize: 13,
        color: c.text,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

interface PpeCategoryProps {
  icon: string;
  title: string;
  oshaRef: string;
  items: { ppe: string; when: string }[];
  selectionTips: string[];
}

function PpeCategory({ icon, title, oshaRef, items, selectionTips }: PpeCategoryProps) {
  return (
    <div style={{ borderLeft: "3px solid #dc2626", paddingLeft: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>{title}</h3>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{oshaRef}</span>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              fontSize: 13,
              color: "#374151",
              marginBottom: 6,
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600, minWidth: 140 }}>{item.ppe}:</span>
            <span style={{ color: "#4b5563" }}>{item.when}</span>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: "#f9fafb", borderRadius: 6, padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Selection Tips:</div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>
          {selectionTips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InspectionItem({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RelatedDoc({ id, title }: { id: string; title: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        backgroundColor: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        fontSize: 12,
        color: "#374151",
      }}
    >
      <span style={{ fontWeight: 600, color: "#991b1b" }}>{id}</span>
      <span>{title}</span>
    </div>
  );
}
