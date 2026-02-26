import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { VjnService } from "./vjn.service";
import { CreateVjnDto, ShareVjnDto, UpdateVjnDto } from "./dto/create-vjn.dto";
import { VoiceJournalNoteStatus } from "@prisma/client";
import { RequiresModule } from "../billing/module.guard";

@RequiresModule('VIDEO')
@Controller("vjn")
@UseGuards(JwtAuthGuard)
export class VjnController {
  constructor(private readonly vjn: VjnService) {}

  /**
   * Create a new Voice Journal Note.
   * POST /vjn
   */
  @Post()
  create(@Req() req: any, @Body() dto: CreateVjnDto) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.create(actor, dto);
  }

  /**
   * List my VJNs.
   * GET /vjn?projectId=&status=DRAFT|SHARED|ARCHIVED
   */
  @Get()
  list(
    @Req() req: any,
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    const filters: { projectId?: string; status?: VoiceJournalNoteStatus } = {};
    if (projectId) filters.projectId = projectId;
    if (status && Object.values(VoiceJournalNoteStatus).includes(status as VoiceJournalNoteStatus)) {
      filters.status = status as VoiceJournalNoteStatus;
    }
    return this.vjn.list(actor, filters);
  }

  /**
   * Get a single VJN.
   * GET /vjn/:id
   */
  @Get(":id")
  getById(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.getById(id, actor);
  }

  /**
   * Update VJN text (user edits).
   * PATCH /vjn/:id
   */
  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateVjnDto) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.update(id, actor, dto);
  }

  /**
   * Trigger Tier 2 (Whisper + GPT) processing.
   * POST /vjn/:id/process
   */
  @Post(":id/process")
  processAudio(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.processAudio(id, actor);
  }

  /**
   * Share VJN to a target (daily_log, journal, message).
   * POST /vjn/:id/share
   */
  @Post(":id/share")
  share(@Req() req: any, @Param("id") id: string, @Body() dto: ShareVjnDto) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.share(id, actor, dto);
  }

  /**
   * Archive a VJN (soft delete).
   * DELETE /vjn/:id
   */
  @Delete(":id")
  archive(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.vjn.archive(id, actor);
  }
}
