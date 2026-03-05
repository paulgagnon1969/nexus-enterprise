import { SignalingClient, PeerRole } from "./signaling.js";

export type ConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface RTCConnectionOptions {
  signaling: SignalingClient;
  role: PeerRole;
  iceServers: RTCIceServer[];
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: ConnectionState) => void;
}

/**
 * Manages a single WebRTC peer connection for a support session.
 *
 * - Client side: captures screen via getDisplayMedia, sends to agent.
 * - Agent side: receives remote stream, renders in <video>.
 */
export class RTCConnection {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: RTCConnectionOptions) {
    this.setupSignalingListeners();
  }

  /** Start screen capture and create the peer connection (client side). */
  async startScreenShare(): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: false,
    });

    this.createPeerConnection();

    // Add tracks to the peer connection
    for (const track of this.localStream.getTracks()) {
      this.pc!.addTrack(track, this.localStream);

      // When user stops sharing via browser UI
      track.onended = () => this.stop();
    }

    // Client creates the SDP offer
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.opts.signaling.sendSignal("offer", offer.sdp!);

    this.startHeartbeat();
    return this.localStream;
  }

  /** Prepare to receive a stream (agent side). */
  prepareToReceive() {
    this.createPeerConnection();
    this.startHeartbeat();
  }

  /** Clean up everything. */
  stop() {
    this.stopHeartbeat();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────

  private createPeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers: this.opts.iceServers });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.opts.signaling.sendIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState as ConnectionState;
      this.opts.onStateChange?.(state);

      if (state === "failed" || state === "closed") {
        this.stop();
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.opts.onRemoteStream?.(event.streams[0]);
      }
    };
  }

  private setupSignalingListeners() {
    // Handle incoming SDP offer (agent side)
    this.opts.signaling.on("signal", async (data) => {
      if (!this.pc) return;

      if (data.type === "offer") {
        await this.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.opts.signaling.sendSignal("answer", answer.sdp!);
      } else if (data.type === "answer") {
        await this.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      }
    });

    // Handle incoming ICE candidates
    this.opts.signaling.on("ice-candidate", async (data) => {
      if (!this.pc) return;
      try {
        await this.pc.addIceCandidate(data.candidate);
      } catch {
        // Candidate may arrive before remote description — safe to ignore
      }
    });

    // Handle session end from the other side
    this.opts.signaling.on("session-ended", () => {
      this.stop();
    });

    this.opts.signaling.on("peer-disconnected", () => {
      this.stop();
    });
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.opts.signaling.heartbeat();
    }, 15_000); // Every 15 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
