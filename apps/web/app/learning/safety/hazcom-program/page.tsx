"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function HazcomProgramPage() {
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
            <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 500 }}>SAF-HAZ-001</span>
            <span style={{ fontSize: 10, color: "#4b5563", backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
              29 CFR 1910.1200
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Hazard Communication (HazCom) Program</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            GHS labeling, Safety Data Sheets (SDS), chemical inventory management, and employee training.
          </p>
        </header>

        {/* Purpose */}
        <Section title="Purpose">
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            The Hazard Communication Standard (HazCom) ensures that employees are informed about
            chemical hazards in the workplace. This program establishes procedures for labeling,
            Safety Data Sheets (SDS), and employee training to protect NEXUS team members from
            chemical hazards on job sites.
          </p>
        </Section>

        {/* Key Requirements */}
        <Section title="Key Requirements">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <RequirementCard
              number="1"
              title="Written Program"
              description="Maintain a written HazCom program describing labeling, SDS, and training procedures"
            />
            <RequirementCard
              number="2"
              title="Chemical Inventory"
              description="Maintain a list of all hazardous chemicals present in the workplace"
            />
            <RequirementCard
              number="3"
              title="Safety Data Sheets"
              description="Obtain and maintain SDS for all hazardous chemicals; make accessible to employees"
            />
            <RequirementCard
              number="4"
              title="Container Labeling"
              description="Ensure all containers are labeled with GHS-compliant labels"
            />
            <RequirementCard
              number="5"
              title="Employee Training"
              description="Train employees on chemical hazards before initial assignment and when new hazards are introduced"
            />
          </div>
        </Section>

        {/* GHS Labels */}
        <Section title="GHS Label Elements">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            The Globally Harmonized System (GHS) standardizes chemical hazard communication worldwide.
            All chemical containers must display these label elements:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <LabelElement
              title="Product Identifier"
              description="Chemical name or code matching the SDS"
              example="e.g., 'Acetone' or 'Product XYZ-123'"
            />
            <LabelElement
              title="Signal Word"
              description="Indicates hazard severity"
              example="'DANGER' (more severe) or 'WARNING' (less severe)"
            />
            <LabelElement
              title="Hazard Pictograms"
              description="Red-bordered diamond symbols indicating hazard types"
              example="See pictogram reference below"
            />
            <LabelElement
              title="Hazard Statements"
              description="Standardized phrases describing the nature of hazards"
              example="e.g., 'Highly flammable liquid and vapor'"
            />
            <LabelElement
              title="Precautionary Statements"
              description="Recommended measures to minimize exposure or adverse effects"
              example="e.g., 'Keep away from heat, sparks, open flames'"
            />
            <LabelElement
              title="Supplier Information"
              description="Name, address, and phone number of manufacturer or distributor"
              example="Required on all shipped containers"
            />
          </div>
        </Section>

        {/* GHS Pictograms */}
        <Section title="GHS Pictograms">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            Learn to recognize these hazard symbols. They appear on chemical labels and Safety Data Sheets.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <PictogramCard symbol="🔥" name="Flame" hazards={["Flammables", "Self-reactives", "Pyrophorics", "Self-heating", "Emits flammable gas"]} />
            <PictogramCard symbol="⚠️" name="Exclamation Mark" hazards={["Irritant", "Skin sensitizer", "Acute toxicity (harmful)", "Narcotic effects", "Respiratory irritant"]} />
            <PictogramCard symbol="☠️" name="Skull & Crossbones" hazards={["Acute toxicity (fatal or toxic)"]} />
            <PictogramCard symbol="🧪" name="Corrosion" hazards={["Skin corrosion/burns", "Eye damage", "Corrosive to metals"]} />
            <PictogramCard symbol="💨" name="Gas Cylinder" hazards={["Gases under pressure"]} />
            <PictogramCard symbol="🔴" name="Oxidizer (Flame over circle)" hazards={["Oxidizers"]} />
            <PictogramCard symbol="💥" name="Exploding Bomb" hazards={["Explosives", "Self-reactives", "Organic peroxides"]} />
            <PictogramCard symbol="🏥" name="Health Hazard" hazards={["Carcinogen", "Respiratory sensitizer", "Reproductive toxicity", "Target organ toxicity", "Mutagenicity", "Aspiration hazard"]} />
            <PictogramCard symbol="🌿" name="Environment" hazards={["Aquatic toxicity"]} />
          </div>
        </Section>

        {/* Safety Data Sheets */}
        <Section title="Safety Data Sheets (SDS)">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            SDSs contain detailed information about hazardous chemicals. They follow a standardized
            16-section format. Key sections to know:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SdsSection number={1} title="Identification" description="Product name, supplier info, emergency phone" highlight />
            <SdsSection number={2} title="Hazard(s) Identification" description="GHS classification, label elements, other hazards" highlight />
            <SdsSection number={3} title="Composition/Ingredients" description="Chemical name, common name, CAS number, concentrations" />
            <SdsSection number={4} title="First-Aid Measures" description="Symptoms, required treatment by exposure route" highlight />
            <SdsSection number={5} title="Fire-Fighting Measures" description="Suitable extinguishing media, special hazards" highlight />
            <SdsSection number={6} title="Accidental Release Measures" description="Spill cleanup procedures, containment" highlight />
            <SdsSection number={7} title="Handling and Storage" description="Safe handling practices, storage conditions" />
            <SdsSection number={8} title="Exposure Controls/PPE" description="Exposure limits, engineering controls, required PPE" highlight />
            <SdsSection number={9} title="Physical/Chemical Properties" description="Appearance, odor, pH, flash point, etc." />
            <SdsSection number={10} title="Stability and Reactivity" description="Chemical stability, incompatible materials" />
            <SdsSection number={11} title="Toxicological Information" description="Health effects, routes of exposure" />
            <SdsSection number={12} title="Ecological Information" description="Environmental impact (non-mandatory)" />
            <SdsSection number={13} title="Disposal Considerations" description="Safe disposal methods (non-mandatory)" />
            <SdsSection number={14} title="Transport Information" description="Shipping requirements (non-mandatory)" />
            <SdsSection number={15} title="Regulatory Information" description="Safety, health, environmental regulations (non-mandatory)" />
            <SdsSection number={16} title="Other Information" description="Date of preparation, revision info" />
          </div>

          <AlertBox type="info" style={{ marginTop: 12 }}>
            <strong>SDS Access:</strong> SDSs must be readily accessible to employees during their work shift.
            NEXUS maintains SDSs in the SDS Library (linked from the Safety Manual Quick Reference).
          </AlertBox>
        </Section>

        {/* Chemical Inventory */}
        <Section title="Chemical Inventory Management">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Maintain a current list of all hazardous chemicals used or stored at each work location</li>
            <li>Update the inventory when new chemicals are introduced or removed</li>
            <li>Cross-reference each chemical to its SDS</li>
            <li>Include product name, manufacturer, location stored, and quantity</li>
            <li>Review inventory at least annually</li>
          </ul>
        </Section>

        {/* Secondary Container Labeling */}
        <Section title="Secondary Container Labeling">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            When chemicals are transferred from original containers to secondary containers:
          </p>

          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#991b1b" }}>
              Secondary Container Requirements
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><strong>Label required:</strong> Product identifier + words, pictures, symbols, or combination that provides general hazard information</li>
              <li><strong>Exception:</strong> Labeling not required if the chemical will be used immediately and entirely by the person who transferred it</li>
              <li><strong>Best practice:</strong> Use GHS-compliant secondary labels with pictograms when available</li>
            </ul>
          </div>

          <AlertBox type="warning" style={{ marginTop: 12 }}>
            <strong>Never</strong> store chemicals in unlabeled containers. If you find an unlabeled container,
            do not use it—report it to your supervisor immediately.
          </AlertBox>
        </Section>

        {/* Employee Training */}
        <Section title="Employee Training">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            All employees who work with or may be exposed to hazardous chemicals must be trained.
            Training must cover:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TrainingTopic
              title="Initial Training (Before Assignment)"
              items={[
                "Location and availability of the written HazCom program",
                "Location and availability of SDSs",
                "Physical and health hazards of chemicals in the work area",
                "Protective measures: work practices, emergency procedures, PPE",
                "How to read labels and SDSs",
                "How to detect the presence or release of hazardous chemicals",
              ]}
            />
            <TrainingTopic
              title="Refresher Training"
              items={[
                "When new hazardous chemicals are introduced",
                "When processes change affecting chemical exposure",
                "When employees transfer to work areas with different hazards",
                "Annually as a best practice",
              ]}
            />
          </div>
        </Section>

        {/* Contractor Communication */}
        <Section title="Multi-Employer Worksites">
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            When NEXUS employees work alongside other contractors, we must:
          </p>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Inform other employers of hazardous chemicals our employees may be exposed to</li>
            <li>Provide access to our SDSs</li>
            <li>Inform other employers of precautionary measures needed</li>
            <li>Inform other employers of our labeling system</li>
            <li>Request the same information from other employers on site</li>
          </ul>
        </Section>

        {/* Related Documents */}
        <Section title="Related Documents">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <RelatedDoc id="SAF-HAZ-002" title="Reading Safety Data Sheets (SDS)" />
            <RelatedDoc id="SAF-HAZ-003" title="Chemical Storage & Segregation" />
            <RelatedDoc id="SAF-PPE-001" title="PPE Requirements & Selection" />
            <RelatedDoc id="SAF-EMER-001" title="Emergency Action Plan" />
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: SAF-HAZ-001 | Category: Hazard Communication | OSHA Reference: 29 CFR 1910.1200 | Last Updated: February 2026
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

function AlertBox({ type, children, style }: { type: "warning" | "info"; children: React.ReactNode; style?: React.CSSProperties }) {
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
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function RequirementCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div
      style={{
        padding: 12,
        backgroundColor: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: "#dc2626",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {number}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

function LabelElement({ title, description, example }: { title: string; description: string; example: string }) {
  return (
    <div style={{ borderLeft: "3px solid #dc2626", paddingLeft: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}>{description}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, fontStyle: "italic" }}>{example}</div>
    </div>
  );
}

function PictogramCard({ symbol, name, hazards }: { symbol: string; name: string; hazards: string[] }) {
  return (
    <div
      style={{
        padding: 10,
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 24 }}>{symbol}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{name}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#4b5563", lineHeight: 1.5 }}>
        {hazards.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
    </div>
  );
}

function SdsSection({ number, title, description, highlight }: { number: number; title: string; description: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 10px",
        backgroundColor: highlight ? "#fef2f2" : "#f9fafb",
        border: highlight ? "1px solid #fecaca" : "1px solid #e5e7eb",
        borderRadius: 6,
      }}
    >
      <span
        style={{
          minWidth: 24,
          height: 24,
          borderRadius: 4,
          backgroundColor: highlight ? "#dc2626" : "#6b7280",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {number}
      </span>
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{title}</span>
        <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 6 }}>— {description}</span>
      </div>
    </div>
  );
}

function TrainingTopic({ title, items }: { title: string; items: string[] }) {
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
