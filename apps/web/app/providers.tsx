"use client";

import type { ReactNode } from "react";
import { BusyOverlayProvider } from "./busy-overlay-context";
import { ViewRoleProvider } from "./view-as-role-context";
import { ViewRoleSwitcher } from "./view-as-role-switcher";
import { RoleAuditProvider, RoleAuditLegend } from "./role-audit";
import {
  SecurityInspectorProvider,
  SecurityInspectorOverlay,
} from "./components/security-inspector";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ViewRoleProvider>
      <RoleAuditProvider>
        <SecurityInspectorProvider>
          <BusyOverlayProvider>
            {children}
            <ViewRoleSwitcher />
            <RoleAuditLegend />
            <SecurityInspectorOverlay />
          </BusyOverlayProvider>
        </SecurityInspectorProvider>
      </RoleAuditProvider>
    </ViewRoleProvider>
  );
}
