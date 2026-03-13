import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "crypto";
import { Public } from "../auth/auth.guards";

const PAYLOAD_SIZE = 1024 * 1024; // 1 MB

/**
 * Lightweight endpoints for NexBRIDGE clients to measure bandwidth
 * to the API server. No auth required — these are used during the
 * heartbeat cycle to report network quality.
 */
@Public()
@Controller("mesh")
export class MeshSpeedController {
  /** Pre-generated 1 MB random buffer for download tests */
  private readonly testPayload = randomBytes(PAYLOAD_SIZE);

  /**
   * Download speed test — client measures time to receive 1 MB.
   */
  @Get("speed-test")
  downloadTest(@Res() reply: FastifyReply) {
    reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Length", PAYLOAD_SIZE)
      .header("Cache-Control", "no-store")
      .send(this.testPayload);
  }

  /**
   * Upload speed test — client sends 1 MB, server responds with timing.
   * The client measures the total round-trip for the upload.
   */
  @Post("speed-test")
  uploadTest(@Req() request: FastifyRequest) {
    const body = request.body as Buffer | undefined;
    const receivedBytes = body?.length ?? 0;
    return {
      ok: true,
      receivedBytes,
      serverTime: Date.now(),
    };
  }

  /**
   * Simple latency ping — minimal payload for RTT measurement.
   */
  @Get("ping")
  ping() {
    return { ok: true, t: Date.now() };
  }
}
