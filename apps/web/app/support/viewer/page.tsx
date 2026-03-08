"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Stage = "enter-code" | "connecting" | "waiting" | "viewing" | "ended" | "error";
type ControlMode = "off" | "requesting" | "active";

export default function ViewerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ViewerInner />
    </Suspense>
  );
}

function ViewerInner() {
  const params = useSearchParams();
  const initialCode = params.get("code") || "";

  const [stage, setStage] = useState<Stage>("enter-code");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("");
  const [controlMode, setControlMode] = useState<ControlMode>("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const rtcRef = useRef<any>(null);
  const signalingRef = useRef<any>(null);

  useEffect(() => {
    if (initialCode) handleJoin(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = useCallback(async (sessionCode: string) => {
    setStage("connecting");
    setError("");
    setControlMode("off");

    try {
      const { SignalingClient, RTCConnection, SupportApiClient } = await import(
        "@repo/support-client"
      );

      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:8001";

      const token = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
      const api = new SupportApiClient(apiBase, token);
      const { iceServers } = await api.getIceServers();

      await api.getSession(sessionCode);
      const userId = JSON.parse(atob(token.split(".")[1])).sub;

      const signaling = new SignalingClient(apiBase, token);
      signalingRef.current = signaling;
      await signaling.connect();

      const joinResult = await signaling.joinSession(sessionCode, userId, "agent");
      if (joinResult.error) throw new Error(joinResult.error);

      // Remote control signaling responses
      signaling.on("control:grant", () => setControlMode("active"));
      signaling.on("control:revoke", () => setControlMode("off"));
      signaling.on("session-ended", () => setStage("ended"));

      const rtc = new RTCConnection({
        signaling,
        role: "agent",
        iceServers,
        onRemoteStream: (stream: MediaStream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setStage("viewing");
        },
        onStateChange: (state: string) => {
          setConnectionState(state);
          if (state === "failed" || state === "closed") setStage("ended");
        },
      });
      rtcRef.current = rtc;
      rtc.prepareToReceive();

      setStage("waiting");
    } catch (err: any) {
      setError(err.message || "Failed to connect");
      setStage("error");
    }
  }, []);

  // ── Remote control input relay ─────────────────────────────────────────

  const sendMouseEvent = useCallback(
    (type: "mousemove" | "mousedown" | "mouseup", e: React.MouseEvent<HTMLVideoElement>, button?: string) => {
      if (controlMode !== "active") return;
      const video = videoRef.current;
      if (!video) return;
      const rect = video.getBoundingClientRect();
      // Normalize to 0–1 using the video element display bounds
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      rtcRef.current?.sendInputEvent({ type, x, y, button });
    },
    [controlMode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (controlMode !== "active") return;
      e.preventDefault();
      rtcRef.current?.sendInputEvent({ type: "keydown", key: e.key });
    },
    [controlMode],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (controlMode !== "active") return;
      e.preventDefault();
      rtcRef.current?.sendInputEvent({ type: "keyup", key: e.key });
    },
    [controlMode],
  );

  const handleRequestControl = useCallback(() => {
    signalingRef.current?.sendControlRequest();
    setControlMode("requesting");
  }, []);

  const handleReleaseControl = useCallback(() => {
    signalingRef.current?.sendControlRevoke();
    setControlMode("off");
  }, []);

  const handleEnd = useCallback(() => {
    rtcRef.current?.stop();
    signalingRef.current?.endSession();
    signalingRef.current?.disconnect();
    setStage("ended");
    setControlMode("off");
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (stage === "ended") {
    return (
      <div style={styles.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={styles.heading}>Session Ended</h1>
        <p style={styles.subtext}>The support session has ended.</p>
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
        <p style={styles.subtext}>Connecting…</p>
      </div>
    );
  }

  if (stage === "waiting") {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <h1 style={styles.heading}>Waiting for Client</h1>
        <p style={styles.subtext}>
          The client needs to start sharing their screen.
        </p>
        {/* Hidden video element — ready when stream arrives */}
        <video ref={videoRef} autoPlay playsInline style={{ display: "none" }} />
      </div>
    );
  }

  if (stage === "viewing") {
    return (
      <div style={styles.viewerContainer}>
        {/* Video — intercept mouse/keyboard when control is active */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            ...styles.video,
            cursor: controlMode === "active" ? "crosshair" : "default",
            outline:
              controlMode === "active"
                ? "3px solid #f97316"
                : controlMode === "requesting"
                  ? "3px solid #fbbf24"
                  : "none",
          }}
          onMouseMove={(e) => sendMouseEvent("mousemove", e)}
          onMouseDown={(e) => sendMouseEvent("mousedown", e, ["left", "middle", "right"][e.button] ?? "left")}
          onMouseUp={(e) => sendMouseEvent("mouseup", e, ["left", "middle", "right"][e.button] ?? "left")}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          tabIndex={controlMode === "active" ? 0 : -1}
          // Prevent context menu during remote control
          onContextMenu={(e) => { if (controlMode === "active") e.preventDefault(); }}
        />
        <div style={styles.toolbar}>
          <span style={styles.toolbarText}>
            <span
              style={{
                ...styles.liveDotSmall,
                background: controlMode === "active" ? "#f97316" : "#22c55e",
                boxShadow: controlMode === "active"
                  ? "0 0 6px #f97316"
                  : "0 0 6px #22c55e",
              }}
            />
            {controlMode === "active"
              ? "Remote Control Active"
              : controlMode === "requesting"
                ? "Waiting for client…"
                : "Viewing client screen"}
          </span>
          <span style={styles.toolbarText}>
            {connectionState || "connected"}
          </span>
          {/* Remote control toggle */}
          {controlMode === "off" && (
            <button type="button" onClick={handleRequestControl} style={styles.controlBtn}>
              Request Control
            </button>
          )}
          {controlMode === "requesting" && (
            <button type="button" disabled style={{ ...styles.controlBtn, opacity: 0.5 }}>
              Waiting…
            </button>
          )}
          {controlMode === "active" && (
            <button type="button" onClick={handleReleaseControl} style={styles.releaseBtn}>
              Release Control
            </button>
          )}
          <button type="button" onClick={handleEnd} style={styles.endBtn}>
            End Session
          </button>
        </div>
      </div>
    );
  }

  // ── Enter Code ────────────────────────────────────────────────────
  return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Support Viewer</h1>
        <p style={styles.subtext}>
          Enter the session code to view a client&apos;s screen.
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
          style={{ ...styles.btn, opacity: code.length === 6 ? 1 : 0.5 }}
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

// ── Styles ──────────────────────────────────────────────────────────────

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
  viewerContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    background: "#000",
  },
  video: {
    flex: 1,
    width: "100%",
    objectFit: "contain",
    background: "#000",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    background: "#1e293b",
    borderTop: "1px solid #334155",
    gap: 16,
  },
  toolbarText: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#94a3b8",
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
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 8px",
    color: "#f8fafc",
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
  endBtn: {
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    background: "#dc2626",
    color: "#fff",
    cursor: "pointer",
  },
  controlBtn: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
  },
  releaseBtn: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    background: "#f97316",
    color: "#fff",
    cursor: "pointer",
  },
  liveDotSmall: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22c55e",
    display: "inline-block",
    boxShadow: "0 0 6px #22c55e",
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
