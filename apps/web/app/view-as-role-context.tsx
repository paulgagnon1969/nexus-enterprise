"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export type ViewRole = 
  | "ACTUAL" 
  | "SUPER_ADMIN"
  | "OWNER" 
  | "ADMIN" 
  | "EXECUTIVE"
  | "PM"
  | "SUPER"
  | "FOREMAN"
  | "CREW"
  | "CLIENT";

interface ViewRoleState {
  viewAs: ViewRole;
  setViewAs: (role: ViewRole) => void;
}

const ViewRoleContext = createContext<ViewRoleState | undefined>(undefined);

export function ViewRoleProvider({ children }: { children: ReactNode }) {
  const [viewAs, setViewAs] = useState<ViewRole>("ACTUAL");

  return (
    <ViewRoleContext.Provider value={{ viewAs, setViewAs }}>
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole(): ViewRoleState {
  const ctx = useContext(ViewRoleContext);
  if (!ctx) {
    throw new Error("useViewRole must be used within a ViewRoleProvider");
  }
  return ctx;
}

/**
 * Safe version that returns defaults if outside provider
 */
export function useViewRoleSafe(): ViewRoleState {
  const ctx = useContext(ViewRoleContext);
  return ctx ?? { viewAs: "ACTUAL", setViewAs: () => {} };
}
