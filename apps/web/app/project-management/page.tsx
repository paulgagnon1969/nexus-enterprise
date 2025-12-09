"use client";

import { PageCard } from "../ui-shell";

export default function ProjectManagementPage() {
  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Project Management</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This area will host detailed project management tools (schedules, tasks, and workflow views).
      </p>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        For now, use the <strong>Proj Overview</strong> tab to see and filter your jobs.
      </p>
    </PageCard>
  );
}
