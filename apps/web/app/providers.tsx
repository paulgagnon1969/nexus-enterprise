"use client";

import type { ReactNode } from "react";
import { BusyOverlayProvider } from "./busy-overlay-context";
import { ViewRoleProvider } from "./view-as-role-context";
import { ViewRoleSwitcher } from "./view-as-role-switcher";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ViewRoleProvider>
      <BusyOverlayProvider>
        {children}
        <ViewRoleSwitcher />
      </BusyOverlayProvider>
    </ViewRoleProvider>
  );
}
