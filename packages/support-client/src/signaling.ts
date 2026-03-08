import { io, Socket } from "socket.io-client";

export type PeerRole = "client" | "agent";

export interface SignalingEvents {
  "peer-joined": (data: { role: PeerRole; userId: string }) => void;
  "peer-disconnected": (data: { role: PeerRole }) => void;
  signal: (data: { type: "offer" | "answer"; sdp: string; from: PeerRole }) => void;
  "ice-candidate": (data: { candidate: RTCIceCandidateInit; from: PeerRole }) => void;
  "session-ended": (data: { endedBy: PeerRole }) => void;
  /** Agent → Client: agent is requesting remote control permission. */
  "control:request": (data: { from: PeerRole }) => void;
  /** Client → Agent: client granted remote control. */
  "control:grant": (data: { from: PeerRole }) => void;
  /** Either party: remote control revoked. */
  "control:revoke": (data: { from: PeerRole }) => void;
}

export interface JoinResult {
  ok?: boolean;
  error?: string;
  sessionId?: string;
  mode?: string;
  peers?: string[];
}

/**
 * Thin wrapper around Socket.IO for the /support namespace.
 * Handles connection, session join, and signaling relay.
 */
export class SignalingClient {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Function>>();

  constructor(
    private serverUrl: string,
    private authToken?: string,
  ) {}

  /** Connect to the signaling server. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(`${this.serverUrl}/support`, {
        transports: ["websocket"],
        auth: this.authToken ? { token: this.authToken } : undefined,
      });

      this.socket.on("connect", () => resolve());
      this.socket.on("connect_error", (err) => reject(err));

      // Forward all signaling events to registered listeners
      const events: (keyof SignalingEvents)[] = [
        "peer-joined",
        "peer-disconnected",
        "signal",
        "ice-candidate",
        "session-ended",
        "control:request",
        "control:grant",
        "control:revoke",
      ];
      for (const event of events) {
        this.socket.on(event, (data: any) => {
          const fns = this.listeners.get(event);
          if (fns) fns.forEach((fn) => fn(data));
        });
      }
    });
  }

  /** Join a session room by code. */
  async joinSession(code: string, userId: string, role: PeerRole): Promise<JoinResult> {
    if (!this.socket) throw new Error("Not connected");
    return new Promise((resolve) => {
      this.socket!.emit("join-session", { code, userId, role }, (result: JoinResult) => {
        resolve(result);
      });
    });
  }

  /** Send SDP offer or answer. */
  sendSignal(type: "offer" | "answer", sdp: string) {
    this.socket?.emit("signal", { type, sdp });
  }

  /** Send ICE candidate. */
  sendIceCandidate(candidate: RTCIceCandidateInit) {
    this.socket?.emit("ice-candidate", { candidate });
  }

  /** End the session. */
  endSession() {
    this.socket?.emit("end-session");
  }

  /** Send heartbeat. */
  heartbeat() {
    this.socket?.emit("heartbeat");
  }

  /** Agent requests remote control from the client. */
  sendControlRequest() {
    this.socket?.emit("control:request");
  }

  /** Client grants remote control to the agent. */
  sendControlGrant() {
    this.socket?.emit("control:grant");
  }

  /** Either party revokes remote control. */
  sendControlRevoke() {
    this.socket?.emit("control:revoke");
  }

  /** Register a listener for signaling events. */
  on<K extends keyof SignalingEvents>(event: K, fn: SignalingEvents[K]) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  /** Remove a listener. */
  off<K extends keyof SignalingEvents>(event: K, fn: SignalingEvents[K]) {
    this.listeners.get(event)?.delete(fn);
  }

  /** Disconnect from the signaling server. */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}
