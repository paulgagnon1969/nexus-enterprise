import { Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard, Roles } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DailyLogService } from "./daily-log.service";
import { Role } from "@prisma/client";

@Controller("daily-logs/:logId/attachments")
export class DailyLogAttachmentsController {
  constructor(private readonly dailyLogs: DailyLogService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.listAttachments(logId, user.companyId, user);
  }

@UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @Req() req: any,
    @Param("logId") logId: string,
    @UploadedFile()
    file: {
      originalname?: string;
      mimetype?: string;
      buffer: Buffer;
      size?: number;
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.addAttachment(logId, user.companyId, user, file);
  }
}
