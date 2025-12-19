"use client";

import { PageCard } from "../ui-shell";

export default function NexusSystemOverviewPage() {
  return (
    <PageCard>
      <div>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>NEXUS SYSTEM</h2>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Super Admin overview. Select an Organization on the left to view its jobs.
        </p>

        <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              flex: "1 1 280px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Test Organizations</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Coming next: quick filters + health indicators across orgs.
            </div>
          </div>

          <div
            style={{
              flex: "1 1 280px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Test Jobs</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Coming next: show jobs for the selected org (status + links).
            </div>
          </div>
        </div>
      </div>
    </PageCard>
  );
}
