import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { CombinedAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DailyLogService } from "./daily-log.service";
import type { FastifyRequest } from "fastify";

@Controller("daily-logs/:logId/attachments")
export class DailyLogAttachmentsController {
  constructor(private readonly dailyLogs: DailyLogService) {}

  @UseGuards(CombinedAuthGuard)
  @Get()
  list(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.listAttachments(logId, user.companyId, user);
  }

  /**
   * Generate a signed GCS upload URL so mobile clients can upload
   * directly to cloud storage without proxying through this server.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("upload-url")
  async getUploadUrl(
    @Req() req: any,
    @Param("logId") logId: string,
    @Body() body: { fileName: string; mimeType: string; sizeBytes?: number },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.getSignedUploadUrl(logId, user.companyId, user, body);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  async upload(@Req() req: FastifyRequest, @Param("logId") logId: string) {
    const user = (req as any).user as AuthenticatedUser;

    const parts = (req as any).parts?.();
    if (!parts) {
      throw new BadRequestException("Multipart support is not configured");
    }

    let filePart:
      | {
          filename: string;
          mimetype: string;
          toBuffer: () => Promise<Buffer>;
        }
      | undefined;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        filePart = part;
      }
    }

    if (!filePart) {
      throw new BadRequestException("No file uploaded");
    }

    const buffer = await filePart.toBuffer();

    return this.dailyLogs.addAttachment(logId, user.companyId, user, {
      originalname: filePart.filename,
      mimetype: filePart.mimetype,
      buffer,
      size: buffer.length,
    });
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("link")
  async linkAttachment(
    @Req() req: any,
    @Param("logId") logId: string,
    @Body()
    body: {
      fileUrl: string;
      fileName?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.addAttachmentLink(logId, user.companyId, user, body);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("ocr")
  async triggerOcr(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.triggerOcrForLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Delete(":attachmentId")
  async deleteAttachment(
    @Req() req: any,
    @Param("logId") logId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.deleteAttachment(logId, attachmentId, user.companyId, user);
  }
}
