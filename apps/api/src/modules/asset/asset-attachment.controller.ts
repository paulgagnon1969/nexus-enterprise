import { Controller, Get, Post, Delete, Param, Req, Res, UseGuards, Logger, NotFoundException } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { AssetAttachmentRepository } from "../../infra/prisma-v1/asset-attachment.repository";
import { ObjectStorageService } from "../../infra/storage/object-storage.service";
import { readMultipleFilesFromMultipart } from "../../infra/uploads/multipart";
import { AssetAttachmentCategory } from "@prisma/client";

const ASSET_ATTACHMENTS_BUCKET = "asset-attachments";
const VALID_CATEGORIES = new Set(Object.values(AssetAttachmentCategory));

@Controller("assets/:assetId/attachments")
@UseGuards(JwtAuthGuard)
export class AssetAttachmentController {
  private readonly logger = new Logger(AssetAttachmentController.name);

  constructor(
    private readonly attachments: AssetAttachmentRepository,
    private readonly storage: ObjectStorageService,
  ) {}

  // ── List attachments ─────────────────────────────────────────────────
  @Get()
  async list(@Req() req: any, @Param("assetId") assetId: string) {
    const user = req.user as AuthenticatedUser;
    return this.attachments.listForAsset(user.companyId, assetId);
  }

  // ── Upload one or more files ─────────────────────────────────────────
  @Post()
  async upload(@Req() req: FastifyRequest, @Param("assetId") assetId: string) {
    const user = (req as any).user as AuthenticatedUser;

    const { files, fields } = await readMultipleFilesFromMultipart(req, {
      captureFields: ["category", "notes"],
    });

    const rawCategory = (fields.category ?? "OTHER").toUpperCase();
    const category = VALID_CATEGORIES.has(rawCategory as AssetAttachmentCategory)
      ? (rawCategory as AssetAttachmentCategory)
      : AssetAttachmentCategory.OTHER;

    const results: any[] = [];

    for (const file of files) {
      const buffer = await file.toBuffer();
      const safeName = (file.filename || "upload").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const key = `${user.companyId}/${assetId}/${Date.now()}-${safeName}`;

      await this.storage.uploadBuffer({
        bucket: ASSET_ATTACHMENTS_BUCKET,
        key,
        buffer,
        contentType: file.mimetype || "application/octet-stream",
      });

      const record = await this.attachments.create({
        companyId: user.companyId,
        assetId,
        fileName: file.filename || safeName,
        fileType: file.mimetype || null,
        fileSize: buffer.length,
        storageKey: key,
        category,
        notes: fields.notes || null,
        uploadedByUserId: user.userId,
      });

      results.push(record);

      this.logger.log(
        `Uploaded ${safeName} (${Math.round(buffer.length / 1024)} KB) → ${ASSET_ATTACHMENTS_BUCKET}/${key}`,
      );
    }

    return results;
  }

  // ── Download (signed URL redirect) ───────────────────────────────────
  @Get(":attachmentId/download")
  async download(
    @Req() req: any,
    @Res() reply: FastifyReply,
    @Param("assetId") _assetId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const att = await this.attachments.getById(user.companyId, attachmentId);
    if (!att) throw new NotFoundException("Attachment not found");

    const url = await this.storage.createSignedReadUrl({
      bucket: ASSET_ATTACHMENTS_BUCKET,
      key: att.storageKey,
      expiresInSeconds: 60 * 15,
    });

    return reply.redirect(url);
  }

  // ── Delete ────────────────────────────────────────────────────────────
  @Delete(":attachmentId")
  async remove(
    @Req() req: any,
    @Param("assetId") _assetId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const deleted = await this.attachments.delete(user.companyId, attachmentId);
    if (!deleted) throw new NotFoundException("Attachment not found");

    // Best-effort delete from storage
    await this.storage.deleteFile({
      bucket: ASSET_ATTACHMENTS_BUCKET,
      key: deleted.storageKey,
    }).catch(() => {});

    return { ok: true, id: deleted.id };
  }
}
