"use client";

import { PageCard } from "../ui-shell";

export default function FinancialPage() {
  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Financial</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This section will eventually surface job financials, budgets, and cost tracking.
      </p>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        For now, it exists as a placeholder to avoid 404s when testers click <strong>Financial</strong>.
      </p>
    </PageCard>
  );
}
