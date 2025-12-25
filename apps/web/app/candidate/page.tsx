"use client";

import { PageCard } from "../ui-shell";

export default function CandidateHomePage() {
  return (
    <PageCard>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Candidate Portal</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This account is part of the national applicant pool. Tenant organization
        modules are disabled here by design.
      </p>
      <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />
      <div style={{ fontSize: 13 }}>
        Next:
        <ul style={{ marginTop: 8 }}>
          <li>Show onboarding checklist status</li>
          <li>Upload documents</li>
          <li>Update skills matrix</li>
        </ul>
      </div>
    </PageCard>
  );
}
