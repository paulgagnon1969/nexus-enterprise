"use client";

import type { ReactNode } from "react";
import * as React from "react";

// NOTE: Busy overlay / delayed indicator was introduced as a perceived performance
// enhancement, but it can mask real issues (like data not rendering) and makes
// debugging harder. We keep the API surface (so callers don't change) but make it
// a no-op: no overlay and no delay.

type BusyOverlayApi = {
  visible: boolean;
  message: string;
  setMessage: (msg: string) => void;
  begin: (msg?: string) => () => void;
  run: <T>(msg: string, fn: () => Promise<T>) => Promise<T>;
};

const BusyOverlayContext = React.createContext<BusyOverlayApi | null>(null);

export function BusyOverlayProvider({ children }: { children: ReactNode }) {
  // True no-op: callers can keep using the API, but it should not trigger rerenders.
  const api = React.useMemo<BusyOverlayApi>(() => {
    return {
      visible: false,
      message: "Working…",
      setMessage: (_msg: string) => {
        // no-op
      },
      begin: (_msg?: string) => {
        return () => {
          // no-op
        };
      },
      run: async <T,>(_msg: string, fn: () => Promise<T>) => {
        return await fn();
      },
    };
  }, []);

  return <BusyOverlayContext.Provider value={api}>{children}</BusyOverlayContext.Provider>;
}

export function useBusyOverlay(): BusyOverlayApi {
  const ctx = React.useContext(BusyOverlayContext);
  if (!ctx) {
    throw new Error("useBusyOverlay must be used within <BusyOverlayProvider />");
  }
  return ctx;
}
