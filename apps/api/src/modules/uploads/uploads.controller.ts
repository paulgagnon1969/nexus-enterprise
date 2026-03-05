import { BadRequestException, Body, Controller, Get, Logger, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { ObjectStorageService } from "../../infra/storage/object-storage.service";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";
import type { FastifyRequest } from "fastify";

@Controller("uploads")
@UseGuards(JwtAuthGuard)
// Handles signed upload URL creation for rich message/journal attachments.
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly gcs: ObjectStorageService) {}

  @Post()
  async createUpload(
    @Req() req: any,
    @Body()
    body: {
      contentType?: string;
      fileName?: string;
      scope?: "MESSAGE" | "JOURNAL" | "NTT" | "BILL" | "OTHER";
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    const contentType = body.contentType || "application/octet-stream";

    const rawName = body.fileName && body.fileName.trim().length > 0 ? body.fileName.trim() : "upload";
    const safeName = rawName.replace(/[^a-zA-Z0-9_.-]/g, "_");

    const keyParts = [
      "user-uploads",
      actor.companyId,
      actor.userId,
      `${Date.now()}`,
      safeName,
    ].filter(Boolean);
    const key = keyParts.join("/");

    const { uploadUrl, fileUri } = await this.gcs.createSignedUploadUrl({
      key,
      contentType,
    });

    const publicUrl = this.gcs.getPublicUrlFromUri(fileUri);

    return {
      uploadUrl,
      fileUri,
      publicUrl,
    };
  }

  /**
   * POST /uploads/file
   *
   * Direct file upload — the browser sends the file as multipart to the API,
   * which stores it in object storage (GCS or MinIO) server-side.
   *
   * This avoids the browser needing to PUT directly to a presigned URL, which
   * fails when MinIO is behind Docker / Cloudflare Tunnel (unreachable
   * presigned hostname).
   */
  /**
   * GET /uploads/signed?uri=gs://bucket/key
   *
   * Returns a time-limited signed URL for a storage URI. Used by the frontend
   * to display images/files stored in MinIO without exposing raw gs:// URIs.
   */
  @Get("signed")
  async getSignedUrl(
    @Query("uri") uri: string,
  ) {
    if (!uri || (!uri.startsWith("gs://") && !uri.startsWith("s3://"))) {
      throw new BadRequestException("Invalid storage URI");
    }

    const match = uri.match(/^(?:gs|s3):\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new BadRequestException("Malformed storage URI");
    }

    const signedUrl = await this.gcs.createSignedReadUrl({
      bucket: match[1]!,
      key: match[2]!,
      expiresInSeconds: 60 * 60, // 1 hour
    });

    return { url: signedUrl };
  }

  @Post("file")
  async uploadFileDirect(@Req() req: FastifyRequest) {
    const actor = (req as any).user as AuthenticatedUser;

    const { file, fields } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
      captureFields: ["scope"],
    });

    const buffer = await file.toBuffer();

    // 100 MB hard limit (matches fastify-multipart config)
    if (buffer.length > 100 * 1024 * 1024) {
      throw new BadRequestException("File too large. Maximum size is 100 MB.");
    }

    const rawName = file.filename?.trim() || "upload";
    const safeName = rawName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const contentType = file.mimetype || "application/octet-stream";

    const keyParts = [
      "user-uploads",
      actor.companyId,
      actor.userId,
      `${Date.now()}`,
      safeName,
    ].filter(Boolean);
    const key = keyParts.join("/");

    const fileUri = await this.gcs.uploadBuffer({
      key,
      buffer,
      contentType,
    });

    const publicUrl = this.gcs.getPublicUrlFromUri(fileUri);

    this.logger.log(
      `Direct upload: ${safeName} (${contentType}, ${Math.round(buffer.length / 1024)} KB) → ${fileUri}`,
    );

    return {
      fileUri,
      publicUrl,
    };
  }
}
