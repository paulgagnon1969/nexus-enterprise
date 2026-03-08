// ---------------------------------------------------------------------------
// Distributed Compute Mesh — Client
// ---------------------------------------------------------------------------
import { io, Socket } from "socket.io-client";
import { invoke } from "@tauri-apps/api/core";
import { getOrCreateDeviceId, getDevicePlatform } from "./device";
import { getAccessToken } from "./api";

// ---------------------------------------------------------------------------
// Types (mirrors server-side mesh-node.interface.ts)
// ---------------------------------------------------------------------------

export interface NodeCapabilities {
  canOcr: boolean;
  canVideoProcess: boolean;
  canPdfRender: boolean;
  canCsvParse: boolean;
  canRoomScan: boolean;
  canBomExtract: boolean;
  canPrecisionScan: boolean;
}

export interface NodeResources {
  cpuCores: number;
  ramGb: number;
  gpuAvailable: boolean;
  platform: string;
}

export interface NodeNetwork {
  downloadMbps: number;
  uploadMbps: number;
  apiLatencyMs: number;
}

export interface NodePower {
  batteryPct: number | null;
  onAc: boolean;
}

export interface NodeRegistration {
  nodeId: string;
  userId: string;
  companyId: string;
  appVersion: string;
  capabilities: NodeCapabilities;
  resources: NodeResources;
  network: NodeNetwork;
  power: NodePower;
  /** True if this node detected the API server on localhost (same machine) */
  isServerHost: boolean;
}

export interface HeartbeatPayload {
  nodeId: string;
  cpuLoadPct: number;
  network: NodeNetwork;
  power: NodePower;
  activeJobs: number;
}

export interface JobOffer {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
}

export interface JobResult {
  jobId: string;
  result: Record<string, unknown>;
  processingMs: number;
}

// Tauri command return type
interface TauriSystemInfo {
  cpu_cores: number;
  ram_gb: number;
  platform: string;
  battery_pct: number | null;
  on_ac: boolean;
  cpu_load_pct: number;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type MeshStatus = "disconnected" | "connecting" | "connected" | "error";

type StatusListener = (status: MeshStatus) => void;
type JobOfferListener = (offer: JobOffer) => void;

// ---------------------------------------------------------------------------
// MeshClient singleton
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 15_000;
const SPEED_TEST_INTERVAL_MS = 5 * 60_000; // re-measure every 5 min
const RECONNECT_DELAY_MS = 5_000;

class MeshClient {
  private socket: Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private speedTestTimer: ReturnType<typeof setInterval> | null = null;

  private _status: MeshStatus = "disconnected";
  private statusListeners = new Set<StatusListener>();
  private jobOfferListeners = new Set<JobOfferListener>();

  private nodeId = "";
  private userId = "";
  private companyId = "";
  private appVersion = "1.0.0";
  private serverUrl = "";

  // Cached network metrics (updated by speed test)
  private lastNetwork: NodeNetwork = { downloadMbps: 50, uploadMbps: 10, apiLatencyMs: 50 };

  // Track active job count
  activeJobs = 0;

  get status() {
    return this._status;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(opts: {
    serverUrl: string;
    userId: string;
    companyId: string;
    appVersion: string;
  }): Promise<void> {
    if (this.socket?.connected) return;

    this.serverUrl = opts.serverUrl;
    this.userId = opts.userId;
    this.companyId = opts.companyId;
    this.appVersion = opts.appVersion;
    this.nodeId = await getOrCreateDeviceId();

    this.setStatus("connecting");

    const token = getAccessToken();

    this.socket = io(`${this.serverUrl}/mesh`, {
      transports: ["websocket"],
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionAttempts: Infinity,
    });

    this.socket.on("connect", () => this.handleConnect());
    this.socket.on("disconnect", () => this.handleDisconnect());
    this.socket.on("connect_error", (err) => {
      console.warn("[mesh] connect error:", err.message);
      this.setStatus("error");
    });

    // Server → Client events
    this.socket.on("job:offer", (offer: JobOffer) => {
      this.jobOfferListeners.forEach((fn) => fn(offer));
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.stopSpeedTest();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus("disconnected");
  }

  // -------------------------------------------------------------------------
  // Registration & Heartbeat
  // -------------------------------------------------------------------------

  private async handleConnect(): Promise<void> {
    console.log("[mesh] connected, registering node");
    this.setStatus("connected");

    // Measure network before registering
    await this.runSpeedTest();

    // Build registration payload
    const sysInfo = await this.getSysInfo();
    const isServerHost = await this.detectServerColocation();
    if (isServerHost) {
      console.log("[mesh] detected server colocation — this node is the API host");
    }
    const registration: NodeRegistration = {
      nodeId: this.nodeId,
      userId: this.userId,
      companyId: this.companyId,
      appVersion: this.appVersion,
      capabilities: this.detectCapabilities(),
      resources: {
        cpuCores: sysInfo.cpu_cores,
        ramGb: sysInfo.ram_gb,
        gpuAvailable: false, // TODO: detect GPU
        platform: sysInfo.platform,
      },
      network: this.lastNetwork,
      power: {
        batteryPct: sysInfo.battery_pct,
        onAc: sysInfo.on_ac,
      },
      isServerHost,
    };

    this.socket?.emit("node:register", registration);
    this.startHeartbeat();
    this.startSpeedTest();
  }

  private handleDisconnect(): void {
    console.log("[mesh] disconnected");
    this.stopHeartbeat();
    this.stopSpeedTest();
    this.setStatus("disconnected");
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.socket?.connected) return;
    const sysInfo = await this.getSysInfo();
    const payload: HeartbeatPayload = {
      nodeId: this.nodeId,
      cpuLoadPct: sysInfo.cpu_load_pct,
      network: this.lastNetwork,
      power: {
        batteryPct: sysInfo.battery_pct,
        onAc: sysInfo.on_ac,
      },
      activeJobs: this.activeJobs,
    };
    this.socket.emit("node:heartbeat", payload);
  }

  // -------------------------------------------------------------------------
  // Speed test (lightweight ping-based)
  // -------------------------------------------------------------------------

  private startSpeedTest(): void {
    this.stopSpeedTest();
    this.speedTestTimer = setInterval(() => this.runSpeedTest(), SPEED_TEST_INTERVAL_MS);
  }

  private stopSpeedTest(): void {
    if (this.speedTestTimer) {
      clearInterval(this.speedTestTimer);
      this.speedTestTimer = null;
    }
  }

  async runSpeedTest(): Promise<NodeNetwork> {
    try {
      // Ping test — measure round-trip latency to the API
      const pingStart = performance.now();
      const res = await fetch(`${this.serverUrl}/mesh/ping`, { method: "GET" });
      const pingMs = Math.round(performance.now() - pingStart);

      if (!res.ok) throw new Error(`ping failed: ${res.status}`);

      // Download speed test — fetch a known payload
      const dlStart = performance.now();
      const dlRes = await fetch(`${this.serverUrl}/mesh/speed-test`, { method: "GET" });
      const dlData = await dlRes.arrayBuffer();
      const dlMs = performance.now() - dlStart;
      const dlMbps = dlMs > 0 ? (dlData.byteLength * 8) / (dlMs * 1000) : 50; // Mbps

      // Upload speed test — send a 100KB payload
      const uploadPayload = new Uint8Array(100 * 1024);
      const ulStart = performance.now();
      await fetch(`${this.serverUrl}/mesh/speed-test`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: uploadPayload,
      });
      const ulMs = performance.now() - ulStart;
      const ulMbps = ulMs > 0 ? (uploadPayload.byteLength * 8) / (ulMs * 1000) : 10;

      this.lastNetwork = {
        downloadMbps: Math.round(dlMbps * 10) / 10,
        uploadMbps: Math.round(ulMbps * 10) / 10,
        apiLatencyMs: pingMs,
      };
    } catch (err) {
      console.warn("[mesh] speed test failed, using last known values:", err);
    }
    return this.lastNetwork;
  }

  // -------------------------------------------------------------------------
  // Capabilities detection
  // -------------------------------------------------------------------------

  private detectCapabilities(): NodeCapabilities {
    // NexBRIDGE desktop can do everything the server can
    const platform = getDevicePlatform();
    return {
      canOcr: true,           // via Tesseract or server relay
      canVideoProcess: true,  // ffmpeg frame extraction via Tauri
      canPdfRender: true,     // pdf-extract crate
      canCsvParse: true,      // trivial
      canRoomScan: platform === "MACOS" || platform === "WINDOWS",
      canBomExtract: true,
      canPrecisionScan: platform === "MACOS",  // NexCAD — requires macOS for PhotogrammetrySession
    };
  }

  // -------------------------------------------------------------------------
  // Server colocation detection
  // -------------------------------------------------------------------------

  /**
   * Check if this machine is also hosting the API server.
   * Probes localhost:8000/health (shadow API port). If it responds,
   * this node is colocated with the server and should be deprioritized
   * so we don't pile mesh work onto the API host.
   */
  private async detectServerColocation(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("http://localhost:8000/health", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        return data?.ok === true;
      }
      return false;
    } catch {
      return false; // no local API server — this is a pure compute node
    }
  }

  // -------------------------------------------------------------------------
  // System info helper
  // -------------------------------------------------------------------------

  private async getSysInfo(): Promise<TauriSystemInfo> {
    try {
      return await invoke<TauriSystemInfo>("get_system_info");
    } catch {
      // Fallback for dev (Vite without Tauri runtime)
      return {
        cpu_cores: navigator.hardwareConcurrency || 4,
        ram_gb: 8,
        platform: "unknown",
        battery_pct: null,
        on_ac: true,
        cpu_load_pct: 0,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Job communication (client → server)
  // -------------------------------------------------------------------------

  acceptJob(jobId: string): void {
    this.socket?.emit("job:accept", { jobId });
  }

  rejectJob(jobId: string, reason?: string): void {
    this.socket?.emit("job:reject", { jobId, reason });
  }

  sendJobProgress(jobId: string, pct: number, message?: string): void {
    this.socket?.emit("job:progress", { jobId, pct, message });
  }

  sendJobResult(result: JobResult): void {
    this.socket?.emit("job:result", result);
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }

  sendJobError(jobId: string, error: string): void {
    this.socket?.emit("job:error", { jobId, error });
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }

  // -------------------------------------------------------------------------
  // Listeners
  // -------------------------------------------------------------------------

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onJobOffer(fn: JobOfferListener): () => void {
    this.jobOfferListeners.add(fn);
    return () => this.jobOfferListeners.delete(fn);
  }

  private setStatus(s: MeshStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }
}

/** Global singleton — import this everywhere */
export const meshClient = new MeshClient();
