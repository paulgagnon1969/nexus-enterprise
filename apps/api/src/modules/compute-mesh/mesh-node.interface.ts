// ---------------------------------------------------------------------------
// Distributed Compute Mesh — Types
// ---------------------------------------------------------------------------

/** Capabilities a node can offer */
export interface NodeCapabilities {
  canOcr: boolean;
  canVideoProcess: boolean;
  canPdfRender: boolean;
  canCsvParse: boolean;
  canRoomScan: boolean;
  canBomExtract: boolean;
}

/** Hardware resources reported by the node */
export interface NodeResources {
  cpuCores: number;
  ramGb: number;
  gpuAvailable: boolean;
  platform: string; // e.g. "macos-arm64", "windows-x64", "linux-x64"
}

/** Network metrics reported by the node */
export interface NodeNetwork {
  downloadMbps: number;
  uploadMbps: number;
  apiLatencyMs: number;
}

/** Power state */
export interface NodePower {
  batteryPct: number | null; // null = desktop (no battery)
  onAc: boolean;
}

/** Full registration payload sent by the client */
export interface NodeRegistration {
  nodeId: string; // deviceId from NexBRIDGE
  userId: string;
  companyId: string;
  appVersion: string;
  capabilities: NodeCapabilities;
  resources: NodeResources;
  network: NodeNetwork;
  power: NodePower;
}

/** Heartbeat payload (subset — only changing values) */
export interface HeartbeatPayload {
  nodeId: string;
  cpuLoadPct: number; // 0-100
  network: NodeNetwork;
  power: NodePower;
  activeJobs: number;
}

/** Node status in the server-side registry */
export type NodeStatus = "idle" | "busy" | "offline";

/** Server-side representation of a mesh node */
export interface MeshNode extends NodeRegistration {
  status: NodeStatus;
  score: number;
  cpuLoadPct: number;
  activeJobs: number;
  lastHeartbeat: number; // epoch ms
  connectedAt: number; // epoch ms
  socketId: string;
}

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export type MeshJobType =
  | "receipt-ocr"
  | "room-scan"
  | "video-assessment"
  | "pdf-render"
  | "bom-extract"
  | "csv-parse"
  | "selection-sheet";

export type MeshJobStatus =
  | "pending"
  | "offered"
  | "accepted"
  | "processing"
  | "completed"
  | "failed"
  | "fallback";

export interface MeshJob {
  id: string;
  type: MeshJobType;
  companyId: string;
  requestedBy: string; // userId
  preferClient: boolean;
  payload: Record<string, unknown>;
  status: MeshJobStatus;
  assignedNodeId: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: number;
  offeredAt: number | null;
  acceptedAt: number | null;
  completedAt: number | null;
  processingMs: number | null;
}

/** Offer sent from server to client */
export interface JobOffer {
  jobId: string;
  type: MeshJobType;
  payload: Record<string, unknown>;
  timeoutMs: number;
}

/** Result sent from client to server */
export interface JobResult {
  jobId: string;
  result: Record<string, unknown>;
  processingMs: number;
}
