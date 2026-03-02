import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { CombinedAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDailyLogDto } from "./dto/create-daily-log.dto";
import { UpdateDailyLogDto } from "./dto/update-daily-log.dto";
import { OcrFileDto } from "./dto/ocr-file.dto";
import { ReassignDailyLogDto } from "./dto/reassign-daily-log.dto";
import { TranscriptionService } from "../transcription/transcription.service";
import { RequiresModule } from "../billing/module.guard";

/**
 * Cross-project daily logs endpoint.
 * Returns logs across all projects the user has access to.
 */
@RequiresModule('SCHEDULING')
@Controller("daily-logs")
export class DailyLogFeedController {
  constructor(private readonly dailyLogs: DailyLogService) {}

  @UseGuards(CombinedAuthGuard)
  @Get()
  listAll(
    @Req() req: any,
    @Query("projectIds") projectIds?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const filters = {
      projectIds: projectIds ? projectIds.split(",").filter(Boolean) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.dailyLogs.listForUser(user.companyId, user, filters);
  }

  @UseGuards(CombinedAuthGuard)
  @Get(":logId")
  getOne(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.getById(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Patch(":logId")
  update(
    @Req() req: any,
    @Param("logId") logId: string,
    @Body() dto: UpdateDailyLogDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.updateLog(logId, user.companyId, user, dto);
  }

  @UseGuards(CombinedAuthGuard)
  @Delete(":logId")
  delete(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.deleteLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Post(":logId/delay-publish")
  delayPublish(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.delayPublishLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Post(":logId/publish")
  publish(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.publishLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Get(":logId/revisions")
  getRevisions(@Req() req: any, @Param("logId") logId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.getRevisions(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Post(":logId/reassign")
  reassign(
    @Req() req: any,
    @Param("logId") logId: string,
    @Body() dto: ReassignDailyLogDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.reassignLog(logId, dto.targetProjectId, user.companyId, user);
  }

  /**
   * Get merged OCR line items for a daily log (supports multi-receipt).
   * Returns all line items from all OCR results, tagged with ocrResultId + index.
   */
  @UseGuards(CombinedAuthGuard)
  @Get(":logId/ocr-line-items")
  getOcrLineItems(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.getOcrLineItems(logId, user.companyId, user);
  }
}

@RequiresModule('SCHEDULING')
@Controller("projects/:projectId/daily-logs")
export class DailyLogController {
  constructor(
    private readonly dailyLogs: DailyLogService,
    private readonly transcription: TranscriptionService,
  ) {}

  /**
   * Immediate OCR for a project file - call before saving to preview extracted data.
   * Returns vendor, amount, date extracted from the receipt image.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("ocr")
  async ocrFile(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: OcrFileDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.ocrProjectFile(projectId, user.companyId, user, dto.projectFileId);
  }

  @UseGuards(CombinedAuthGuard)
  @Get()
  list(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.listForProject(projectId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  create(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateDailyLogDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.createForProject(projectId, user.companyId, user, dto);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":logId/approve")
  approve(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.approveLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":logId/reject")
  reject(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.rejectLog(logId, user.companyId, user);
  }

  @UseGuards(CombinedAuthGuard)
  @Delete(":logId")
  delete(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.deleteLog(logId, user.companyId, user);
  }

  /**
   * Tier 1 — GPT-only summarization from raw on-device text.
   * POST projects/:projectId/daily-logs/voice/summarize
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("voice/summarize")
  async voiceSummarize(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { rawText: string },
  ) {
    const user = req.user as AuthenticatedUser;
    // Look up project name for context-aware prompt
    const project = await this.dailyLogs.getProjectName(projectId, user.companyId);
    const result = await this.transcription.summarizeText({
      rawText: body.rawText,
      context: "daily_log",
      projectName: project?.name,
    });
    return result;
  }

  /**
   * Tier 2 — Whisper + GPT transcription from audio file.
   * POST projects/:projectId/daily-logs/voice/transcribe
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("voice/transcribe")
  async voiceTranscribe(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { audioFileUrl: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const project = await this.dailyLogs.getProjectName(projectId, user.companyId);
    const result = await this.transcription.transcribeAudio({
      audioFileUrl: body.audioFileUrl,
      context: "daily_log",
      projectName: project?.name,
    });
    return result;
  }
}
