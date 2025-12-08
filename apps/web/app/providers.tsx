"use client";

import type { ReactNode } from "react";
import { ViewRoleProvider } from "./view-as-role-context";
import { ViewRoleSwitcher } from "./view-as-role-switcher";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ViewRoleProvider>
      {children}
      <ViewRoleSwitcher />
    </ViewRoleProvider>
  );
}
