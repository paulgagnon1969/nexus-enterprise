import { useCallback, useRef, useState } from "react";

type Stage = "idle" | "connecting" | "sharing" | "ended" | "error";

/**
 * Support page for NexBRIDGE Connect.
 * Allows the user to share their screen with a Nexus support agent
 * by entering a 6-character session code.
 */
export default function Support() {
  const [stage, setStage] = useState<Stage>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("");
  const rtcRef = useRef<any>(null);
  const signalingRef = useRef<any>(null);

  const handleJoin = useCallback(async (sessionCode: string) => {
    setStage("connecting");
    setError("");

    try {
      const { SignalingClient, RTCConnection, SupportApiClient } = await import(
        "@repo/support-client"
      );

      const apiBase = localStorage.getItem("apiBaseUrl") || "https://staging-api.nfsgrp.com";
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

      const rtc = new RTCConnection({
        signaling,
        role: "client",
        iceServers,
        onStateChange: (state: string) => {
          setConnectionState(state);
          if (state === "connected") setStage("sharing");
          if (state === "failed" || state === "closed") setStage("ended");
        },
      });
      rtcRef.current = rtc;

      await rtc.startScreenShare();
      setStage("sharing");
    } catch (err: any) {
      setError(err.message || "Failed to connect");
      setStage("error");
    }
  }, []);

  const handleStop = useCallback(() => {
    rtcRef.current?.stop();
    signalingRef.current?.endSession();
    signalingRef.current?.disconnect();
    setStage("ended");
  }, []);

  if (stage === "ended") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-slate-900">Session Ended</h2>
        <p className="text-sm text-slate-500">Screen sharing has stopped.</p>
        <button
          onClick={() => { setStage("idle"); setCode(""); }}
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
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
        <h2 className="text-lg font-semibold text-slate-900">Screen is Being Shared</h2>
        <p className="text-sm text-slate-500">
          A support agent can see your screen. They cannot control your computer.
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
