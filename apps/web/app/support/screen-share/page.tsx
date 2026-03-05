"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// ── Types (inline to avoid build-time import issues with workspace package) ──
// The actual WebRTC logic is imported dynamically to keep SSR-safe.

type Stage = "enter-code" | "connecting" | "sharing" | "ended" | "error";

export default function ScreenSharePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ScreenShareInner />
    </Suspense>
  );
}

function ScreenShareInner() {
  const params = useSearchParams();
  const initialCode = params.get("code") || "";

  const [stage, setStage] = useState<Stage>("enter-code");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("");
  const rtcRef = useRef<any>(null);
  const signalingRef = useRef<any>(null);

  // Auto-join if code provided in URL
  useEffect(() => {
    if (initialCode) handleJoin(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = useCallback(async (sessionCode: string) => {
    setStage("connecting");
    setError("");

    try {
      // Dynamic import to avoid SSR issues (browser-only APIs)
      const { SignalingClient, RTCConnection, SupportApiClient } = await import(
        "@repo/support-client"
      );

      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:8001";

      const token = localStorage.getItem("token") || "";

      // Fetch ICE servers
      const api = new SupportApiClient(apiBase, token);
      const { iceServers } = await api.getIceServers();

      // Verify session exists
      const session = await api.getSession(sessionCode);
      const userId = JSON.parse(atob(token.split(".")[1])).sub;

      // Connect signaling
      const signaling = new SignalingClient(apiBase, token);
      signalingRef.current = signaling;
      await signaling.connect();

      const joinResult = await signaling.joinSession(
        sessionCode,
        userId,
        "client"
      );
      if (joinResult.error) throw new Error(joinResult.error);

      // Set up WebRTC
      const rtc = new RTCConnection({
        signaling,
        role: "client",
        iceServers,
        onStateChange: (state: string) => {
          setConnectionState(state);
          if (state === "connected") setStage("sharing");
          if (state === "failed" || state === "closed") {
            setStage("ended");
          }
        },
      });
      rtcRef.current = rtc;

      // Start screen capture + send offer
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

  // ── Render ──────────────────────────────────────────────────────────

  if (stage === "ended") {
    return (
      <div style={styles.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={styles.heading}>Screen Sharing Ended</h1>
        <p style={styles.subtext}>You can close this tab.</p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div style={styles.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={styles.heading}>Connection Error</h1>
        <p style={{ ...styles.subtext, color: "#ef4444" }}>{error}</p>
        <button
          type="button"
          onClick={() => setStage("enter-code")}
          style={styles.btn}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (stage === "connecting") {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <p style={styles.subtext}>Connecting to support session…</p>
      </div>
    );
  }

  if (stage === "sharing") {
    return (
      <div style={styles.centered}>
        <div style={styles.sharingCard}>
          <div style={styles.liveDot} />
          <h1 style={styles.heading}>Screen is Being Shared</h1>
          <p style={styles.subtext}>
            A support agent can see your screen. They cannot control your
            computer.
          </p>
          <p style={{ ...styles.subtext, fontSize: 12, opacity: 0.6 }}>
            Connection: {connectionState || "active"}
          </p>
          <button type="button" onClick={handleStop} style={styles.stopBtn}>
            Stop Sharing
          </button>
        </div>
      </div>
    );
  }

  // ── Enter Code ────────────────────────────────────────────────────
  return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Nexus Remote Support</h1>
        <p style={styles.subtext}>
          Enter the 6-character session code provided by your support agent.
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          style={styles.input}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6) handleJoin(code);
          }}
        />
        <button
          type="button"
          onClick={() => handleJoin(code)}
          disabled={code.length !== 6}
          style={{
            ...styles.btn,
            opacity: code.length === 6 ? 1 : 0.5,
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={styles.centered}>
      <p style={{ color: "#94a3b8" }}>Loading…</p>
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    background: "#0f172a",
    color: "#f8fafc",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: 24,
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 40,
    maxWidth: 420,
    width: "100%",
    textAlign: "center" as const,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  sharingCard: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 40,
    maxWidth: 420,
    width: "100%",
    textAlign: "center" as const,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    border: "2px solid #22c55e",
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  subtext: {
    fontSize: 14,
    color: "#94a3b8",
    margin: "0 0 24px",
    lineHeight: 1.5,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "0.3em",
    textAlign: "center" as const,
    borderRadius: 8,
    border: "2px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
    outline: "none",
    marginBottom: 16,
    fontFamily: "monospace",
  },
  btn: {
    width: "100%",
    padding: "14px 24px",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
  },
  stopBtn: {
    padding: "14px 32px",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#dc2626",
    color: "#fff",
    cursor: "pointer",
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#22c55e",
    margin: "0 auto 16px",
    boxShadow: "0 0 8px #22c55e",
    animation: "pulse 2s infinite",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "4px solid #334155",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: 16,
  },
};
