import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { GcsService } from "../../infra/storage/gcs.service";

@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly gcs: GcsService) {}

  @Post()
  async createUpload(
    @Req() req: any,
    @Body()
    body: {
      contentType?: string;
      fileName?: string;
      scope?: "MESSAGE" | "JOURNAL" | "NTT" | "OTHER";
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
}
