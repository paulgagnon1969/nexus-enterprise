import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { ComputeMeshService } from "./compute-mesh.service";
import { MeshJobService } from "./mesh-job.service";
import type {
  NodeRegistration,
  HeartbeatPayload,
  JobResult,
  JobOffer,
} from "./mesh-node.interface";

/**
 * Real-time gateway for the Distributed Compute Mesh.
 *
 * Namespace: /mesh
 * Transport: WebSocket (Socket.IO)
 *
 * Clients (NexBRIDGE Connect) connect after authentication and register
 * as compute nodes. The server dispatches jobs to the best available node.
 */
@WebSocketGateway({
  namespace: "/mesh",
  cors: { origin: true, credentials: true },
})
export class ComputeMeshGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ComputeMeshGateway.name);

  /** socket.id → nodeId mapping for disconnect cleanup */
  private socketToNode = new Map<string, string>();

  constructor(
    private readonly meshService: ComputeMeshService,
    private readonly jobService: MeshJobService,
  ) {}

  afterInit() {
    // Wire the job service's emit function to our Socket.IO server
    this.jobService.setEmitOffer((socketId: string, offer: JobOffer) => {
      this.server.to(socketId).emit("job:offer", offer);
    });
    this.logger.log("Compute Mesh gateway initialized on /mesh");
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const nodeId = this.socketToNode.get(client.id);
    if (nodeId) {
      await this.meshService.unregisterNode(nodeId);
      this.socketToNode.delete(client.id);
      this.logger.log(`Node disconnected: ${nodeId} (socket=${client.id})`);
    }
  }

  // ---------------------------------------------------------------------------
  // Node lifecycle events
  // ---------------------------------------------------------------------------

  @SubscribeMessage("node:register")
  async handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: NodeRegistration,
  ) {
    try {
      const node = await this.meshService.registerNode(payload, client.id);
      this.socketToNode.set(client.id, payload.nodeId);

      // Join a company room for potential broadcasts
      client.join(`company:${payload.companyId}`);

      return { ok: true, nodeId: node.nodeId, score: node.score };
    } catch (err: any) {
      this.logger.error(`Registration failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage("node:heartbeat")
  async handleHeartbeat(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: HeartbeatPayload,
  ) {
    const node = await this.meshService.heartbeat(payload);
    if (!node) return { ok: false, error: "Node not registered" };
    return { ok: true, score: node.score, status: node.status };
  }

  // ---------------------------------------------------------------------------
  // Job lifecycle events (client → server)
  // ---------------------------------------------------------------------------

  @SubscribeMessage("job:accept")
  async handleJobAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { jobId: string },
  ) {
    const nodeId = this.socketToNode.get(client.id);
    if (!nodeId) return { ok: false, error: "Not registered" };

    const accepted = await this.jobService.handleAccept(payload.jobId, nodeId);
    return { ok: accepted };
  }

  @SubscribeMessage("job:result")
  async handleJobResult(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: JobResult,
  ) {
    const ok = await this.jobService.handleResult(payload);
    return { ok };
  }

  @SubscribeMessage("job:reject")
  async handleJobReject(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { jobId: string; reason: string },
  ) {
    await this.jobService.handleReject(payload.jobId, payload.reason);
    return { ok: true };
  }

  @SubscribeMessage("job:progress")
  async handleJobProgress(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { jobId: string; pct: number; message: string },
  ) {
    await this.jobService.handleProgress(
      payload.jobId,
      payload.pct,
      payload.message,
    );
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Admin queries
  // ---------------------------------------------------------------------------

  @SubscribeMessage("mesh:status")
  async handleMeshStatus() {
    const nodes = await this.meshService.getAllNodes();
    return {
      ok: true,
      nodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        userId: n.userId,
        companyId: n.companyId,
        platform: n.resources.platform,
        status: n.status,
        score: n.score,
        cpuLoadPct: n.cpuLoadPct,
        activeJobs: n.activeJobs,
        uploadMbps: n.network.uploadMbps,
        lastHeartbeat: n.lastHeartbeat,
      })),
    };
  }
}
