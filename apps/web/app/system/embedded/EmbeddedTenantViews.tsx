"use client";

import type { ReactNode } from "react";
import ProjectsPage from "../../projects/page";
import ProjectManagementPage from "../../project-management/page";
import FinancialPage from "../../financial/page";
import FilesPage from "../../files/page";
import MessagingPage from "../../messaging/page";
import ReportsPage from "../../reports/page";

export type TenantViewKey =
  | "projects"
  | "project-management"
  | "files"
  | "messaging"
  | "financial"
  | "reports";

export function EmbeddedTenantView(props: {
  view: TenantViewKey;
  companyId: string | null;
  projectId: string | null;
}): JSX.Element {
  const { view } = props;

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        padding: 8,
      }}
    >
      {view === "projects" && <ProjectsPage />}
      {view === "project-management" && <ProjectManagementPage />}
      {view === "files" && <FilesPage />}
      {view === "messaging" && <MessagingPage />}
      {view === "financial" && <FinancialPage />}
      {view === "reports" && <ReportsPage />}
    </div>
  );
}
