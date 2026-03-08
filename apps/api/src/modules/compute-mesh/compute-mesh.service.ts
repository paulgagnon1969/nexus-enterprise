import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../infra/redis/redis.service";
import type {
  MeshNode,
  NodeRegistration,
  HeartbeatPayload,
  NodeStatus,
  MeshJobType,
} from "./mesh-node.interface";

const NODE_TTL = 90; // seconds — node is considered offline if no heartbeat for 90s
const REGISTRY_PREFIX = "mesh:node:";
const COMPANY_SET_PREFIX = "mesh:company:";

@Injectable()
export class ComputeMeshService {
  private readonly logger = new Logger(ComputeMeshService.name);

  constructor(private readonly redis: RedisService) {}

  // ---------------------------------------------------------------------------
  // Node lifecycle
  // ---------------------------------------------------------------------------

  async registerNode(
    reg: NodeRegistration,
    socketId: string,
  ): Promise<MeshNode> {
    const now = Date.now();
    const node: MeshNode = {
      ...reg,
      status: "idle",
      score: this.computeScore(reg, 0, 0),
      cpuLoadPct: 0,
      activeJobs: 0,
      lastHeartbeat: now,
      connectedAt: now,
      socketId,
    };

    await this.saveNode(node);
    this.logger.log(
      `Node registered: ${node.nodeId} (${node.resources.platform}) score=${node.score} company=${node.companyId}`,
    );
    return node;
  }

  async heartbeat(payload: HeartbeatPayload): Promise<MeshNode | null> {
    const node = await this.getNode(payload.nodeId);
    if (!node) return null;

    node.cpuLoadPct = payload.cpuLoadPct;
    node.network = payload.network;
    node.power = payload.power;
    node.activeJobs = payload.activeJobs;
    node.lastHeartbeat = Date.now();
    node.status = payload.activeJobs > 0 ? "busy" : "idle";
    node.score = this.computeScore(node, payload.cpuLoadPct, payload.activeJobs);

    await this.saveNode(node);
    return node;
  }

  async unregisterNode(nodeId: string): Promise<void> {
    const node = await this.getNode(nodeId);
    if (!node) return;

    const client = this.redis.getClient();
    await client.del(`${REGISTRY_PREFIX}${nodeId}`);
    await client.srem(`${COMPANY_SET_PREFIX}${node.companyId}`, nodeId);
    this.logger.log(`Node unregistered: ${nodeId}`);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async getNode(nodeId: string): Promise<MeshNode | null> {
    return this.redis.getJson<MeshNode>(`${REGISTRY_PREFIX}${nodeId}`);
  }

  async getCompanyNodes(companyId: string): Promise<MeshNode[]> {
    const client = this.redis.getClient();
    const nodeIds: string[] = await client.smembers(
      `${COMPANY_SET_PREFIX}${companyId}`,
    );
    if (!nodeIds.length) return [];

    const nodes: MeshNode[] = [];
    for (const id of nodeIds) {
      const node = await this.getNode(id);
      if (node) {
        // Check staleness
        if (Date.now() - node.lastHeartbeat > NODE_TTL * 1000) {
          node.status = "offline";
          node.score = 0;
        }
        nodes.push(node);
      }
    }
    return nodes;
  }

  /**
   * Find the best available node for a job in the given company.
   * Returns null if no suitable client node is available.
   */
  async getBestNode(
    companyId: string,
    jobType: MeshJobType,
    preferUserId?: string,
  ): Promise<MeshNode | null> {
    const nodes = await this.getCompanyNodes(companyId);

    const candidates = nodes
      .filter((n) => n.status !== "offline")
      .filter((n) => this.nodeSupportsJob(n, jobType))
      .sort((a, b) => {
        // Same-user affinity: boost preferred user's node
        const aBoost = preferUserId && a.userId === preferUserId ? 10 : 0;
        const bBoost = preferUserId && b.userId === preferUserId ? 10 : 0;
        return (b.score + bBoost) - (a.score + aBoost);
      });

    return candidates[0] ?? null;
  }

  /**
   * Get all online nodes across all companies (admin view).
   */
  async getAllNodes(): Promise<MeshNode[]> {
    const client = this.redis.getClient();
    const keys: string[] = await client.keys(`${REGISTRY_PREFIX}*`);
    const nodes: MeshNode[] = [];
    for (const key of keys) {
      const raw = await client.get(key);
      if (raw) {
        try {
          const node = JSON.parse(raw) as MeshNode;
          if (Date.now() - node.lastHeartbeat > NODE_TTL * 1000) {
            node.status = "offline";
            node.score = 0;
          }
          nodes.push(node);
        } catch { /* skip corrupt entries */ }
      }
    }
    return nodes;
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  /**
   * Compute a 0-100 capability score for a node.
   *
   * Weights (rebalanced for LAN-heavy deployments):
   *   - Bandwidth (upload):        25%  (less dominant when nodes share a LAN)
   *   - Available CPU:             35%  (primary differentiator)
   *   - Power stability:           15%
   *   - Latency:                    5%
   *   - Idle bonus:           up to 10   (genuinely idle nodes get priority)
   *   - Server-colocation penalty: -15   (don't pile work onto the API host)
   *   - Active-job penalty:   -5 per job
   */
  private computeScore(
    reg: NodeRegistration | MeshNode,
    cpuLoadPct: number,
    activeJobs: number,
  ): number {
    const bw = Math.min(reg.network.uploadMbps / 100, 1) * 25;
    const cpu = Math.max(0, (100 - cpuLoadPct) / 100) * 35;
    const power = reg.power.onAc
      ? 15
      : Math.min((reg.power.batteryPct ?? 0) / 100, 1) * 8;
    const latency = Math.max(0, (500 - reg.network.apiLatencyMs) / 500) * 5;

    // Idle bonus — genuinely idle nodes should be preferred
    const idleBonus = (cpuLoadPct < 20 && activeJobs === 0) ? 10 : 0;

    // Server-colocation penalty — don't compete with the API for resources
    const serverPenalty = reg.isServerHost ? 15 : 0;

    // Penalize nodes already running jobs
    const jobPenalty = activeJobs * 5;

    const raw = bw + cpu + power + latency + idleBonus - serverPenalty - jobPenalty;
    return Math.max(0, Math.round(raw));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private nodeSupportsJob(node: MeshNode, jobType: MeshJobType): boolean {
    const cap = node.capabilities;
    switch (jobType) {
      case "receipt-ocr":
        return cap.canOcr;
      case "room-scan":
        return cap.canRoomScan;
      case "video-assessment":
        return cap.canVideoProcess;
      case "pdf-render":
        return cap.canPdfRender;
      case "bom-extract":
        return cap.canBomExtract;
      case "csv-parse":
        return cap.canCsvParse;
      case "selection-sheet":
        return cap.canPdfRender;
      default:
        return false;
    }
  }

  private async saveNode(node: MeshNode): Promise<void> {
    const client = this.redis.getClient();
    await client.setex(
      `${REGISTRY_PREFIX}${node.nodeId}`,
      NODE_TTL * 2, // Redis TTL = 2× heartbeat timeout (auto-cleanup)
      JSON.stringify(node),
    );
    await client.sadd(`${COMPANY_SET_PREFIX}${node.companyId}`, node.nodeId);
  }
}
