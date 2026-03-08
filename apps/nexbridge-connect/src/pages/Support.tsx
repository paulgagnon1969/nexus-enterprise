import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteInputEvent } from "@repo/support-client";

type Stage = "idle" | "connecting" | "sharing" | "ended" | "error";
type ControlState = "none" | "pending" | "active";

/**
 * Support page for NexBRIDGE Connect.
 *
 * Flow:
 *  1. User enters 6-char code from support agent → screen share starts.
 *  2. Agent can request remote control → consent banner appears.
 *  3. If user accepts → remote input events are injected via Tauri.
 *  4. Either side can revoke at any time.
 */
export default function Support() {
  const [stage, setStage] = useState<Stage>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("");
  const [controlState, setControlState] = useState<ControlState>("none");

  const rtcRef = useRef<any>(null);
  const signalingRef = useRef<any>(null);

  // ── Input injection (remote control active) ──────────────────────────────

  const handleRemoteInput = useCallback(async (event: RemoteInputEvent) => {
    try {
      if (event.type === "mousemove" && event.x !== undefined && event.y !== undefined) {
        const sw = window.screen.width;
        const sh = window.screen.height;
        await invoke("inject_mouse_move", {
          x: Math.round(event.x * sw),
          y: Math.round(event.y * sh),
        });
      } else if (
        (event.type === "mousedown" || event.type === "mouseup") &&
        event.button !== undefined
      ) {
        await invoke("inject_mouse_button", {
          button: event.button,
          down: event.type === "mousedown",
        });
      } else if ((event.type === "keydown" || event.type === "keyup") && event.key) {
        await invoke("inject_key", {
          keyName: event.key,
          down: event.type === "keydown",
        });
      }
    } catch (err) {
      console.warn("[support] input injection error:", err);
    }
  }, []);

  // ── Session join ──────────────────────────────────────────────────────────

  const handleJoin = useCallback(
    async (sessionCode: string) => {
      setStage("connecting");
      setError("");
      setControlState("none");

      try {
        const { SignalingClient, RTCConnection, SupportApiClient } = await import(
          "@repo/support-client"
        );

        const apiBase =
          localStorage.getItem("apiBaseUrl") || "https://staging-api.nfsgrp.com";
        const token = localStorage.getItem("token") || "";

        const api = new SupportApiClient(apiBase, token);
        const { iceServers } = await api.getIceServers();
        await api.getSession(sessionCode);

        const userId = JSON.parse(atob(token.split(".")[1])).sub;

        const signaling = new SignalingClient(apiBase, token);
        signalingRef.current = signaling;
        await signaling.connect();

        const joinResult = await signaling.joinSession(sessionCode, userId, "client");
        if (joinResult.error) throw new Error(joinResult.error);

        // Remote control signaling events
        signaling.on("control:request", () => setControlState("pending"));
        signaling.on("control:revoke", () => setControlState("none"));
        signaling.on("session-ended", () => setStage("ended"));

        const rtc = new RTCConnection({
          signaling,
          role: "client",
          iceServers,
          onStateChange: (state: string) => {
            setConnectionState(state);
            if (state === "connected") setStage("sharing");
            if (state === "failed" || state === "closed") setStage("ended");
          },
          onRemoteInput: handleRemoteInput,
        });
        rtcRef.current = rtc;

        await rtc.startScreenShare();
        setStage("sharing");
      } catch (err: any) {
        setError(err.message || "Failed to connect");
        setStage("error");
      }
    },
    [handleRemoteInput],
  );

  const handleGrantControl = useCallback(() => {
    signalingRef.current?.sendControlGrant();
    setControlState("active");
  }, []);

  const handleRevokeControl = useCallback(() => {
    signalingRef.current?.sendControlRevoke();
    setControlState("none");
  }, []);

  const handleStop = useCallback(() => {
    rtcRef.current?.stop();
    signalingRef.current?.endSession();
    signalingRef.current?.disconnect();
    setStage("ended");
    setControlState("none");
  }, []);

  if (stage === "ended") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-slate-900">Session Ended</h2>
        <p className="text-sm text-slate-500">Screen sharing has stopped.</p>
        <button
          onClick={() => { setStage("idle"); setCode(""); setControlState("none"); }}
          className="rounded-lg bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
        >
          New Session
        </button>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-semibold text-slate-900">Connection Error</h2>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => setStage("idle")}
          className="rounded-lg bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (stage === "connecting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
        <p className="text-sm text-slate-500">Connecting to support session…</p>
      </div>
    );
  }

  if (stage === "sharing") {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-4">
        {/* Red pulsing border when remote control is active */}
        {controlState === "active" && (
          <div className="pointer-events-none absolute inset-0 rounded-lg border-4 border-red-500 animate-pulse" />
        )}

        {/* Consent banner */}
        {controlState === "pending" && (
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-lg">
            <div>
              <p className="text-sm font-semibold text-amber-900">Remote Control Request</p>
              <p className="text-xs text-amber-700">Your support agent wants to control your screen.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleGrantControl}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Allow
              </button>
              <button
                onClick={() => setControlState("none")}
                className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                Deny
              </button>
            </div>
          </div>
        )}

        {/* Active control bar */}
        {controlState === "active" && (
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-5 py-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <p className="text-sm font-semibold text-red-900">Remote Control Active</p>
              <p className="text-xs text-red-600">Your support agent is controlling your screen.</p>
            </div>
            <button
              onClick={handleRevokeControl}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Revoke
            </button>
          </div>
        )}

        <div
          className={`h-3 w-3 rounded-full ${
            controlState === "active"
              ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
              : "bg-green-500 shadow-[0_0_8px_#22c55e]"
          }`}
        />
        <h2 className="text-lg font-semibold text-slate-900">Screen is Being Shared</h2>
        <p className="text-sm text-slate-500">
          {controlState === "active"
            ? "Remote control is active. Click Revoke to stop."
            : "A support agent can see your screen."}
        </p>
        <p className="text-xs text-slate-400">Connection: {connectionState || "active"}</p>
        <button
          onClick={handleStop}
          className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Stop Sharing
        </button>
      </div>
    );
  }

  // ── Idle: Enter code ──
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Remote Support</h2>
        <p className="mb-6 text-sm text-slate-500">
          Enter the 6-character code from your support agent to start screen sharing.
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          autoFocus
          className="mb-4 w-full rounded-lg border border-slate-300 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 focus:border-nexus-500 focus:outline-none focus:ring-1 focus:ring-nexus-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6) handleJoin(code);
          }}
        />
        <button
          onClick={() => handleJoin(code)}
          disabled={code.length !== 6}
          className="w-full rounded-lg bg-nexus-600 px-6 py-3 text-sm font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
        >
          Connect
        </button>
      </div>
    </div>
  );
}
