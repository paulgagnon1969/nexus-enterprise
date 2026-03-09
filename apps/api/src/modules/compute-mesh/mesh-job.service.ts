import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { RedisService } from "../../infra/redis/redis.service";
import { ComputeMeshService } from "./compute-mesh.service";
import type {
  MeshJob,
  MeshJobType,
  MeshJobStatus,
  JobOffer,
  JobResult,
  MeshNode,
} from "./mesh-node.interface";

const JOB_PREFIX = "mesh:job:";
const JOB_TTL = 3600; // 1 hour TTL for job records
const DEFAULT_OFFER_TIMEOUT_MS = 5000;

/**
 * Callback registered by the gateway to emit WebSocket events.
 * This avoids a circular dependency between service and gateway.
 */
export type EmitJobOfferFn = (socketId: string, offer: JobOffer) => void;

@Injectable()
export class MeshJobService {
  private readonly logger = new Logger(MeshJobService.name);
  private emitOffer: EmitJobOfferFn | null = null;

  /**
   * Map of jobId → server-fallback callback. When a job times out with no
   * client acceptance, we invoke the fallback to process server-side.
   */
  private fallbacks = new Map<string, (job: MeshJob) => Promise<void>>();

  /** Pending offer timers — cleared when a job is accepted */
  private offerTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly redis: RedisService,
    private readonly mesh: ComputeMeshService,
  ) {}

  /** Called by the gateway to register its emit function */
  setEmitOffer(fn: EmitJobOfferFn) {
    this.emitOffer = fn;
  }

  // ---------------------------------------------------------------------------
  // Create & dispatch
  // ---------------------------------------------------------------------------

  /**
   * Create a compute job and attempt to route it to a client node.
   *
   * @param serverFallback — async function that processes the job server-side
   *   if no client node accepts it. This keeps the existing service logic intact.
   *
   * @returns The job record. Callers can poll for completion or await the
   *   returned promise from the fallback.
   */
  async createJob(params: {
    type: MeshJobType;
    companyId: string;
    requestedBy: string;
    payload: Record<string, unknown>;
    preferClient?: boolean;
    preferUserId?: string;
    searchAllCompanies?: boolean;
    serverFallback: (job: MeshJob) => Promise<Record<string, unknown>>;
  }): Promise<MeshJob> {
    const job: MeshJob = {
      id: randomUUID(),
      type: params.type,
      companyId: params.companyId,
      requestedBy: params.requestedBy,
      preferClient: params.preferClient ?? true,
      payload: params.payload,
      status: "pending",
      assignedNodeId: null,
      result: null,
      error: null,
      createdAt: Date.now(),
      offeredAt: null,
      acceptedAt: null,
      completedAt: null,
      processingMs: null,
    };

    await this.saveJob(job);

    // Try to route to a client node
    if (job.preferClient) {
      const node = await this.mesh.getBestNode(
        job.companyId,
        job.type,
        params.preferUserId,
        params.searchAllCompanies,
      );

      if (node && this.emitOffer) {
        return this.offerToNode(job, node, params.serverFallback);
      }
    }

    // No client available — fallback immediately
    this.logger.log(`Job ${job.id} (${job.type}): no client node, server fallback`);
    return this.executeServerFallback(job, params.serverFallback);
  }

  // ---------------------------------------------------------------------------
  // Offer lifecycle
  // ---------------------------------------------------------------------------

  private async offerToNode(
    job: MeshJob,
    node: MeshNode,
    serverFallback: (job: MeshJob) => Promise<Record<string, unknown>>,
  ): Promise<MeshJob> {
    job.status = "offered";
    job.assignedNodeId = node.nodeId;
    job.offeredAt = Date.now();
    await this.saveJob(job);

    const offer: JobOffer = {
      jobId: job.id,
      type: job.type,
      payload: job.payload,
      timeoutMs: DEFAULT_OFFER_TIMEOUT_MS,
    };

    this.logger.log(
      `Job ${job.id} (${job.type}): offered to node ${node.nodeId} (score=${node.score})`,
    );

    // Store fallback for timeout
    this.fallbacks.set(job.id, async (j) => {
      const result = await serverFallback(j);
      j.result = result;
      j.status = "completed";
      j.completedAt = Date.now();
      await this.saveJob(j);
    });

    // Set timeout — if no ACK, fall back to server
    const timer = setTimeout(async () => {
      this.offerTimers.delete(job.id);
      const current = await this.getJob(job.id);
      if (current && current.status === "offered") {
        this.logger.warn(
          `Job ${job.id} (${job.type}): offer timed out, server fallback`,
        );
        await this.executeServerFallback(current, serverFallback);
      }
    }, DEFAULT_OFFER_TIMEOUT_MS);
    this.offerTimers.set(job.id, timer);

    // Emit to the client
    this.emitOffer!(node.socketId, offer);

    return job;
  }

  /** Called by gateway when client sends job:accept */
  async handleAccept(jobId: string, nodeId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== "offered") return false;

    // Clear timeout
    const timer = this.offerTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.offerTimers.delete(jobId);
    }

    job.status = "accepted";
    job.acceptedAt = Date.now();
    job.assignedNodeId = nodeId;
    await this.saveJob(job);

    this.logger.log(`Job ${jobId} (${job.type}): accepted by node ${nodeId}`);
    return true;
  }

  /** Called by gateway when client sends job:result */
  async handleResult(result: JobResult): Promise<boolean> {
    const job = await this.getJob(result.jobId);
    if (!job || (job.status !== "accepted" && job.status !== "processing")) {
      return false;
    }

    job.status = "completed";
    job.result = result.result;
    job.processingMs = result.processingMs;
    job.completedAt = Date.now();
    await this.saveJob(job);

    this.fallbacks.delete(job.id);
    this.logger.log(
      `Job ${job.id} (${job.type}): completed by client in ${result.processingMs}ms`,
    );
    return true;
  }

  /** Called by gateway when client sends job:reject */
  async handleReject(jobId: string, reason: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Clear offer timeout
    const timer = this.offerTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.offerTimers.delete(jobId);
    }

    this.logger.warn(`Job ${jobId} (${job.type}): rejected by client — ${reason}`);

    // Try next node or fallback
    const fallback = this.fallbacks.get(jobId);
    if (fallback) {
      this.fallbacks.delete(jobId);
      job.status = "fallback";
      job.assignedNodeId = null;
      await this.saveJob(job);
      await fallback(job);
    }
  }

  /** Called by gateway when client sends job:progress */
  async handleProgress(
    jobId: string,
    pct: number,
    message: string,
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    if (job.status === "accepted") {
      job.status = "processing";
      await this.saveJob(job);
    }

    this.logger.debug(`Job ${jobId}: ${pct}% — ${message}`);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async getJob(jobId: string): Promise<MeshJob | null> {
    return this.redis.getJson<MeshJob>(`${JOB_PREFIX}${jobId}`);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async executeServerFallback(
    job: MeshJob,
    serverFallback: (job: MeshJob) => Promise<Record<string, unknown>>,
  ): Promise<MeshJob> {
    job.status = "fallback";
    job.assignedNodeId = null;
    await this.saveJob(job);

    try {
      const start = Date.now();
      const result = await serverFallback(job);
      job.result = result;
      job.status = "completed";
      job.processingMs = Date.now() - start;
      job.completedAt = Date.now();
    } catch (err: any) {
      job.status = "failed";
      job.error = err?.message ?? String(err);
      job.completedAt = Date.now();
      this.logger.error(`Job ${job.id} server fallback failed: ${job.error}`);
    }

    await this.saveJob(job);
    this.fallbacks.delete(job.id);
    return job;
  }

  private async saveJob(job: MeshJob): Promise<void> {
    await this.redis.setJson(`${JOB_PREFIX}${job.id}`, job, JOB_TTL);
  }
}
