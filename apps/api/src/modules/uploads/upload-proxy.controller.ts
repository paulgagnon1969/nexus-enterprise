import {
  BadRequestException,
  Controller,
  Logger,
  Param,
  Put,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Public } from "../auth/auth.guards";
import { UploadProxyService } from "./upload-proxy.service";

/**
 * PUT /uploads/put/:token
 *
 * Accepts a raw file body (no auth header required — the token IS the auth).
 * The browser gets this URL from endpoints like POST /projects/:id/files/upload-url
 * and PUTs the file directly, same as it would to a presigned MinIO URL.
 *
 * This controller intentionally has NO auth guard. The token is single-use and
 * time-limited (15 min), equivalent to a presigned URL.
 */
@Controller("uploads")
@Public()
export class UploadProxyController {
  private readonly logger = new Logger(UploadProxyController.name);

  constructor(private readonly proxy: UploadProxyService) {}

  @Put("put/:token")
  async handleProxyUpload(
    @Param("token") token: string,
    @Req() req: FastifyRequest,
  ) {
    // The body is a raw Buffer (registered via addContentTypeParser in main.ts)
    const body = (req as any).body;

    if (!body || !Buffer.isBuffer(body)) {
      throw new BadRequestException("No file body received");
    }

    if (body.length > 100 * 1024 * 1024) {
      throw new BadRequestException("File too large. Maximum size is 100 MB.");
    }

    const fileUri = await this.proxy.consumeAndUpload(token, body);

    if (!fileUri) {
      throw new BadRequestException("Invalid or expired upload token");
    }

    return { ok: true };
  }
}
