"use client";

import { PageCard } from "../ui-shell";

export default function FinancialPage() {
  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Financial Overview (Coming Soon)</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This page will eventually surface cross-project financial dashboards, rollups,
        and portfolio-level metrics.
      </p>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        To see live financials for a specific job today, open a project under
        <strong> Proj Overview</strong> and use the <strong>FINANCIAL</strong> tab on that project.
      </p>
    </PageCard>
  );
}
