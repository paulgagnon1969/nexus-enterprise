"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export type DelayedBusyOverlayOptions = {
  delayMs?: number;
  zIndex?: number;
};

export function useDelayedBusyOverlay(options?: DelayedBusyOverlayOptions) {
  const delayMs = options?.delayMs ?? 20;

  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState<string>("Working…");
  const [visible, setVisible] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCount > 0) {
      if (timerRef.current != null) return;
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
      }, delayMs);
      return;
    }

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setVisible(false);
  }, [delayMs, pendingCount]);

  const begin = useCallback((nextMessage?: string) => {
    if (nextMessage) setMessage(nextMessage);

    let doneCalled = false;
    setPendingCount((c) => c + 1);

    return () => {
      if (doneCalled) return;
      doneCalled = true;
      setPendingCount((c) => Math.max(0, c - 1));
    };
  }, []);

  const run = useCallback(
    async function runWithOverlay<T>(nextMessage: string, fn: () => Promise<T>): Promise<T> {
      const done = begin(nextMessage);
      try {
        return await fn();
      } finally {
        done();
      }
    },
    [begin],
  );

  return {
    visible,
    message,
    setMessage,
    begin,
    run,
  };
}

export function BusyOverlay(props: { visible: boolean; message: string; zIndex?: number }) {
  const { visible, message, zIndex = 80 } = props;
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        cursor: "wait",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(17,24,39,0.95)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#ffffff",
          fontSize: 12,
          boxShadow: "0 12px 30px rgba(15,23,42,0.35)",
          maxWidth: 520,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 50 50" style={{ display: "block" }}>
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="31.4 100"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 25 25"
              to="360 25 25"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
        <div>{message}</div>
      </div>
    </div>
  );
}
