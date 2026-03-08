import { SignalingClient, PeerRole } from "./signaling.js";

export type ConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface RemoteInputEvent {
  type: "mousemove" | "mousedown" | "mouseup" | "keydown" | "keyup";
  /** Normalized X coordinate (0–1) relative to stream dimensions. Only for mouse events. */
  x?: number;
  /** Normalized Y coordinate (0–1) relative to stream dimensions. Only for mouse events. */
  y?: number;
  /** Mouse button: "left" | "right" | "middle". Only for mousedown/mouseup. */
  button?: string;
  /** Key name (e.g. "a", "Enter", "Backspace"). Only for key events. */
  key?: string;
}

export interface RTCConnectionOptions {
  signaling: SignalingClient;
  role: PeerRole;
  iceServers: RTCIceServer[];
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: ConnectionState) => void;
  /** Called on the client side when a remote input event arrives from the agent. */
  onRemoteInput?: (event: RemoteInputEvent) => void;
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
  /** Data channel for remote input events (agent → client). */
  private inputChannel: RTCDataChannel | null = null;

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

    // Create data channel for incoming remote-input events (client side receives)
    this.inputChannel = this.pc!.createDataChannel("remote-input", { ordered: true });
    this.inputChannel.onmessage = (ev) => {
      try {
        const event: RemoteInputEvent = JSON.parse(ev.data);
        this.opts.onRemoteInput?.(event);
      } catch {
        // malformed event — ignore
      }
    };

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

    // Agent side: listen for the data channel opened by the client
    this.pc!.ondatachannel = (ev) => {
      if (ev.channel.label === "remote-input") {
        this.inputChannel = ev.channel;
      }
    };

    this.startHeartbeat();
  }

  /**
   * Send a remote input event to the client via the data channel.
   * Only usable on the agent side after `prepareToReceive()` and once
   * the data channel is open.
   */
  sendInputEvent(event: RemoteInputEvent): void {
    if (!this.inputChannel || this.inputChannel.readyState !== "open") return;
    this.inputChannel.send(JSON.stringify(event));
  }

  /** Clean up everything. */
  stop() {
    this.stopHeartbeat();

    if (this.inputChannel) {
      this.inputChannel.close();
      this.inputChannel = null;
    }

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
