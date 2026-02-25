"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-react/styles";

// ─── Main page wrapper (Suspense boundary for useSearchParams) ───────────────

export default function JoinCallPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JoinCallInner />
    </Suspense>
  );
}

// ─── Inner component that reads URL params ──────────────────────────────────

function JoinCallInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const wsUrl = params.get("wsUrl");

  const [stage, setStage] = useState<"prejoin" | "incall" | "ended">("prejoin");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera preview for pre-join screen
  useEffect(() => {
    if (stage !== "prejoin") return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        // Camera not available — that's ok
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [stage]);

  const handleJoin = useCallback(() => {
    // Stop the preview stream before LiveKit takes over the camera
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStage("incall");
  }, []);

  const handleDisconnect = useCallback(() => {
    setStage("ended");
  }, []);

  if (!token || !wsUrl) {
    return (
      <div style={styles.centered}>
        <h1 style={styles.heading}>Invalid Call Link</h1>
        <p style={styles.subtext}>
          This link is missing required parameters. Ask the host to send you a
          new invite.
        </p>
      </div>
    );
  }

  // ─── Ended ────────────────────────────────────────────────────────
  if (stage === "ended") {
    return (
      <div style={styles.centered}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📞</div>
        <h1 style={styles.heading}>Call Ended</h1>
        <p style={styles.subtext}>You can close this tab.</p>
      </div>
    );
  }

  // ─── Pre-join ─────────────────────────────────────────────────────
  if (stage === "prejoin") {
    return (
      <div style={styles.centered}>
        <div style={styles.previewCard}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={styles.previewVideo}
          />
          <div style={styles.previewOverlay}>
            <h1 style={styles.heading}>Ready to join?</h1>
            <p style={styles.subtext}>
              You&apos;re joining as a guest. No account required.
            </p>

            <div style={styles.toggleRow}>
              <button
                type="button"
                onClick={() => setVideoEnabled((v) => !v)}
                style={{
                  ...styles.toggleBtn,
                  backgroundColor: videoEnabled ? "#16a34a" : "#dc2626",
                }}
              >
                {videoEnabled ? "📷 Camera On" : "📷 Camera Off"}
              </button>
              <button
                type="button"
                onClick={() => setAudioEnabled((a) => !a)}
                style={{
                  ...styles.toggleBtn,
                  backgroundColor: audioEnabled ? "#16a34a" : "#dc2626",
                }}
              >
                {audioEnabled ? "🎙️ Mic On" : "🎙️ Mic Off"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleJoin}
              style={styles.joinBtn}
            >
              Join Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── In-call ──────────────────────────────────────────────────────
  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect={true}
      video={videoEnabled}
      audio={audioEnabled}
      onDisconnected={handleDisconnect}
      style={{ height: "100dvh" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
      <DisconnectWatcher onDisconnect={handleDisconnect} />
    </LiveKitRoom>
  );
}

/**
 * Watches for room disconnect events and fires the callback.
 * Must be rendered inside <LiveKitRoom>.
 */
function DisconnectWatcher({ onDisconnect }: { onDisconnect: () => void }) {
  const room = useRoomContext();

  useEffect(() => {
    const handler = () => onDisconnect();
    room.on("disconnected", handler);
    return () => {
      room.off("disconnected", handler);
    };
  }, [room, onDisconnect]);

  return null;
}

function Loading() {
  return (
    <div style={styles.centered}>
      <p style={styles.subtext}>Loading…</p>
    </div>
  );
}

// ─── Inline styles (no Tailwind dependency for this page) ───────────────────

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    padding: 24,
    backgroundColor: "#111827",
    color: "#f9fafb",
    textAlign: "center",
  },
  heading: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 700,
    color: "#f9fafb",
  },
  subtext: {
    margin: "0 0 24px",
    fontSize: 15,
    color: "#9ca3af",
    maxWidth: 400,
  },
  previewCard: {
    position: "relative",
    width: "100%",
    maxWidth: 480,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  previewVideo: {
    width: "100%",
    height: 320,
    objectFit: "cover",
    backgroundColor: "#1f2937",
    display: "block",
    transform: "scaleX(-1)",
  },
  previewOverlay: {
    padding: "20px 24px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  toggleRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
  },
  toggleBtn: {
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  joinBtn: {
    width: "100%",
    border: "none",
    borderRadius: 12,
    padding: "14px 0",
    backgroundColor: "#16a34a",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};
