import { useCallback, useRef, useState } from "react";

type Stage = "enter-code" | "connecting" | "sharing" | "ended" | "error";

const API_BASE = "https://staging-api.nfsgrp.com";

export default function App() {
  const [stage, setStage] = useState<Stage>("enter-code");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("");
  const rtcRef = useRef<any>(null);
  const signalingRef = useRef<any>(null);

  // Simple token-less join — the thin client doesn't require login.
  // The session code itself is the auth gate.
  const handleJoin = useCallback(async (sessionCode: string) => {
    setStage("connecting");
    setError("");

    try {
      const { SignalingClient, RTCConnection, SupportApiClient } = await import(
        "@repo/support-client"
      );

      // Thin client may store a token from a quick login or use a public session endpoint
      const token = localStorage.getItem("nexus-support-token") || "";

      const api = new SupportApiClient(API_BASE, token);
      const { iceServers } = await api.getIceServers();
      const session = await api.getSession(sessionCode);

      // Use the session's client user ID or a guest ID
      const userId = session.clientUser?.id || "guest";

      const signaling = new SignalingClient(API_BASE, token);
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

  // ── Styles ────────────────────────────────────────────────────────

  const s = styles;

  if (stage === "ended") {
    return (
      <div style={s.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={s.heading}>Session Ended</h1>
        <p style={s.subtext}>You can close this window.</p>
        <button onClick={() => { setStage("enter-code"); setCode(""); }} style={s.btn}>
          New Session
        </button>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div style={s.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={s.heading}>Connection Error</h1>
        <p style={{ ...s.subtext, color: "#ef4444" }}>{error}</p>
        <button onClick={() => setStage("enter-code")} style={s.btn}>
          Try Again
        </button>
      </div>
    );
  }

  if (stage === "connecting") {
    return (
      <div style={s.centered}>
        <div style={s.spinner} />
        <p style={s.subtext}>Connecting…</p>
      </div>
    );
  }

  if (stage === "sharing") {
    return (
      <div style={s.centered}>
        <div style={s.liveDot} />
        <h1 style={s.heading}>Screen is Being Shared</h1>
        <p style={s.subtext}>
          A support agent can see your screen.
        </p>
        <p style={{ ...s.subtext, fontSize: 12, opacity: 0.6 }}>
          {connectionState || "active"}
        </p>
        <button onClick={handleStop} style={s.stopBtn}>
          Stop Sharing
        </button>
      </div>
    );
  }

  return (
    <div style={s.centered}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>
          <span style={{ fontWeight: 800, fontSize: 20 }}>N</span>
        </div>
        <h1 style={s.heading}>Nexus Support</h1>
        <p style={s.subtext}>
          Enter the session code from your support agent.
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          style={s.input}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6) handleJoin(code);
          }}
        />
        <button
          onClick={() => handleJoin(code)}
          disabled={code.length !== 6}
          style={{ ...s.btn, opacity: code.length === 6 ? 1 : 0.5 }}
        >
          Share My Screen
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    background: "#0f172a",
    color: "#f8fafc",
    padding: 24,
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 40,
    maxWidth: 380,
    width: "100%",
    textAlign: "center" as const,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#3b82f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    color: "#fff",
  },
  heading: { fontSize: 22, fontWeight: 700, margin: "0 0 8px" },
  subtext: { fontSize: 14, color: "#94a3b8", margin: "0 0 24px", lineHeight: 1.5 },
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
