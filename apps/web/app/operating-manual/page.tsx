"use client";

import { PageCard } from "../ui-shell";

export default function OperatingManualPage() {
  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>NEXUS Operating Manual</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            A living reference for how NEXUS runs projects, makes decisions, and delivers work
            across the Nexus Marketplace.
          </p>
        </header>

        <section>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            This is the central hub for the NEXUS Operating Manual. Over time, this space will
            include detailed guidance, playbooks, and reference material for:
          </p>
          <ul style={{ marginTop: 0, marginBottom: 8, paddingLeft: 20, fontSize: 13, color: "#4b5563" }}>
            <li>Engagement lifecycle and project phases</li>
            <li>Roles, responsibilities, and decision rights</li>
            <li>Delivery governance, quality standards, and approvals</li>
            <li>Client communication standards and expectations</li>
            <li>Marketplace and staffing policies for Nexus Marketplace members</li>
          </ul>
          <p style={{ marginTop: 0, marginBottom: 0, fontSize: 13, color: "#4b5563" }}>
            For now, this page is a starting point and placeholder so other LEARNING and
            Marketplace FAQs links have a safe destination. We can expand this into a full
            documentation experience as we define the NEXUS Operating Manual content.
          </p>
        </section>
      </div>
    </PageCard>
  );
}
