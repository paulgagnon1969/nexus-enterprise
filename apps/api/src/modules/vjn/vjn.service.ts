import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { TranscriptionService } from "../transcription/transcription.service";
import { CreateVjnDto, ShareVjnDto, UpdateVjnDto } from "./dto/create-vjn.dto";
import { VoiceJournalNoteStatus } from "@prisma/client";

@Injectable()
export class VjnService {
  private readonly logger = new Logger(VjnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transcription: TranscriptionService,
  ) {}

  /**
   * Create a new VJN from a voice recording.
   * Immediately kicks off Tier 1 (GPT-only) processing if device transcript provided,
   * then queues Tier 2 (Whisper+GPT) for later.
   */
  async create(actor: AuthenticatedUser, dto: CreateVjnDto) {
    const context = dto.contextHint ?? "standalone";

    // Look up project + company names for richer prompts
    let projectName: string | undefined;
    let companyName: string | undefined;

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, companyId: actor.companyId },
        select: { name: true },
      });
      projectName = project?.name ?? undefined;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true },
    });
    companyName = company?.name ?? undefined;

    // Tier 1: Instant GPT summarization if device transcript is available
    const lang = dto.language ?? "en";
    let aiText: string | null = null;
    let aiSummary: string | null = null;
    let aiTextTranslated: string | null = null;
    let aiTranscriptRaw: string | null = dto.deviceTranscript ?? null;

    if (dto.deviceTranscript) {
      try {
        const result = await this.transcription.summarizeText({
          rawText: dto.deviceTranscript,
          context,
          language: lang,
          projectName,
          companyName,
        });
        aiText = result.aiText;
        aiSummary = result.structured?.summary ?? result.aiText.slice(0, 200);
        aiTextTranslated = result.aiTextTranslated ?? null;
      } catch (err: any) {
        this.logger.warn(`Tier 1 summarization failed for VJN: ${err?.message}`);
        // Fall back to raw transcript
        aiText = dto.deviceTranscript;
        aiSummary = dto.deviceTranscript.slice(0, 200);
      }
    }

    // Create the VJN record
    const vjn = await this.prisma.voiceJournalNote.create({
      data: {
        createdById: actor.userId,
        companyId: actor.companyId,
        projectId: dto.projectId ?? null,
        voiceRecordingUrl: dto.voiceRecordingUrl,
        voiceDurationSecs: dto.voiceDurationSecs,
        language: lang,
        deviceTranscript: dto.deviceTranscript ?? null,
        aiTranscriptRaw: aiTranscriptRaw,
        aiText,
        aiSummary,
        aiTextTranslated,
        status: VoiceJournalNoteStatus.DRAFT,
      },
    });

    this.logger.log(`VJN ${vjn.id} created by ${actor.userId}, context=${context}`);

    return vjn;
  }

  /**
   * Trigger Tier 2 (Whisper + GPT) processing for a VJN.
   * Called after initial creation when the user wants a more accurate transcription.
   */
  async processAudio(vjnId: string, actor: AuthenticatedUser) {
    const vjn = await this.findOwned(vjnId, actor);

    let projectName: string | undefined;
    let companyName: string | undefined;

    if (vjn.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: vjn.projectId },
        select: { name: true },
      });
      projectName = project?.name ?? undefined;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true },
    });
    companyName = company?.name ?? undefined;

    const result = await this.transcription.transcribeAudio({
      audioFileUrl: vjn.voiceRecordingUrl,
      context: "standalone",
      language: vjn.language ?? "en",
      projectName,
      companyName,
    });

    const updated = await this.prisma.voiceJournalNote.update({
      where: { id: vjnId },
      data: {
        aiTranscriptRaw: result.rawTranscript ?? vjn.aiTranscriptRaw,
        aiText: result.aiText,
        aiSummary: result.structured?.summary ?? result.aiText.slice(0, 200),
        aiTextTranslated: result.aiTextTranslated ?? vjn.aiTextTranslated,
        voiceDurationSecs: result.durationSecs ?? vjn.voiceDurationSecs,
        language: result.language ?? vjn.language,
      },
    });

    this.logger.log(`VJN ${vjnId} Tier 2 processing complete`);
    return updated;
  }

  /**
   * List VJNs for the current user.
   */
  async list(actor: AuthenticatedUser, filters?: { projectId?: string; status?: VoiceJournalNoteStatus }) {
    const where: any = {
      createdById: actor.userId,
      companyId: actor.companyId,
    };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.status) where.status = filters.status;

    const vjns = await this.prisma.voiceJournalNote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        shares: {
          select: {
            id: true,
            targetModule: true,
            targetEntityId: true,
            sharedAt: true,
          },
        },
      },
    });

    return vjns;
  }

  /**
   * Get a single VJN (must be author).
   */
  async getById(vjnId: string, actor: AuthenticatedUser) {
    const vjn = await this.prisma.voiceJournalNote.findFirst({
      where: { id: vjnId, createdById: actor.userId, companyId: actor.companyId },
      include: {
        project: { select: { id: true, name: true } },
        shares: {
          select: {
            id: true,
            targetModule: true,
            targetEntityId: true,
            sharedSummary: true,
            sharedAt: true,
          },
        },
      },
    });

    if (!vjn) {
      throw new NotFoundException("Voice Journal Note not found");
    }

    return vjn;
  }

  /**
   * Update VJN text (user edits after AI processing).
   */
  async update(vjnId: string, actor: AuthenticatedUser, dto: UpdateVjnDto) {
    const vjn = await this.findOwned(vjnId, actor);

    const data: any = {};
    if (dto.aiText !== undefined) data.aiText = dto.aiText;
    if (dto.aiSummary !== undefined) data.aiSummary = dto.aiSummary;

    const updated = await this.prisma.voiceJournalNote.update({
      where: { id: vjnId },
      data,
    });

    return updated;
  }

  /**
   * Share a VJN to a target (daily_log, journal, or message).
   * Creates a VoiceJournalNoteShare and the corresponding entity.
   */
  async share(vjnId: string, actor: AuthenticatedUser, dto: ShareVjnDto) {
    const vjn = await this.findOwned(vjnId, actor);

    if (!vjn.aiText && !vjn.aiSummary && !vjn.deviceTranscript) {
      throw new BadRequestException("VJN has no transcript to share. Process audio first.");
    }

    const textToShare = vjn.aiText ?? vjn.aiSummary ?? vjn.deviceTranscript ?? "";

    let targetId: string;

    switch (dto.target) {
      case "daily_log":
        targetId = await this.shareToDailyLog(vjn, actor, dto, textToShare);
        break;
      case "journal":
        targetId = await this.shareToJournal(vjn, actor, dto, textToShare);
        break;
      case "message":
        targetId = await this.shareToMessage(vjn, actor, dto, textToShare);
        break;
      default:
        throw new BadRequestException(`Unknown share target: ${dto.target}`);
    }

    // Create share record
    const share = await this.prisma.voiceJournalNoteShare.create({
      data: {
        vjnId: vjn.id,
        targetModule: dto.target,
        targetEntityId: targetId,
        sharedById: actor.userId,
        sharedSummary: vjn.aiSummary,
        sharedDetails: textToShare,
      },
    });

    // Update VJN status to SHARED
    await this.prisma.voiceJournalNote.update({
      where: { id: vjn.id },
      data: { status: VoiceJournalNoteStatus.SHARED },
    });

    this.logger.log(`VJN ${vjn.id} shared to ${dto.target} → ${targetId}`);

    return { share, targetId };
  }

  /**
   * Archive a VJN (soft delete).
   */
  async archive(vjnId: string, actor: AuthenticatedUser) {
    await this.findOwned(vjnId, actor);

    const updated = await this.prisma.voiceJournalNote.update({
      where: { id: vjnId },
      data: { status: VoiceJournalNoteStatus.ARCHIVED },
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async findOwned(vjnId: string, actor: AuthenticatedUser) {
    const vjn = await this.prisma.voiceJournalNote.findFirst({
      where: { id: vjnId, createdById: actor.userId, companyId: actor.companyId },
    });
    if (!vjn) {
      throw new NotFoundException("Voice Journal Note not found");
    }
    return vjn;
  }

  /**
   * Share VJN to a Daily Log (PUDL).
   * Creates a new daily log entry with the VJN transcript as the body.
   */
  private async shareToDailyLog(
    vjn: any,
    actor: AuthenticatedUser,
    dto: ShareVjnDto,
    text: string,
  ): Promise<string> {
    if (!dto.projectId) {
      throw new BadRequestException("projectId is required when sharing to daily_log");
    }

    // Verify project access
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: actor.companyId },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const log = await this.prisma.dailyLog.create({
      data: {
        projectId: dto.projectId,
        createdById: actor.userId,
        logDate: new Date(),
        title: vjn.aiSummary?.slice(0, 100) ?? "Voice Note",
        workPerformed: text,
        aiGenerated: true,
        aiTranscriptRaw: vjn.aiTranscriptRaw,
        aiSummary: vjn.aiSummary,
        voiceRecordingUrl: vjn.voiceRecordingUrl,
        voiceDurationSecs: vjn.voiceDurationSecs,
        vjnId: vjn.id,
        status: "SUBMITTED",
        effectiveShareClient: false,
      },
    });

    return log.id;
  }

  /**
   * Share VJN to Claim Journal.
   * Creates a new journal entry with the VJN transcript.
   */
  private async shareToJournal(
    vjn: any,
    actor: AuthenticatedUser,
    dto: ShareVjnDto,
    text: string,
  ): Promise<string> {
    // Journal entries can reference a project
    const projectId = dto.projectId ?? vjn.projectId;
    if (!projectId) {
      throw new BadRequestException("projectId is required when sharing to journal");
    }

    const entry = await this.prisma.claimJournalEntry.create({
      data: {
        projectId,
        companyId: actor.companyId,
        createdById: actor.userId,
        entryType: "PHONE_CALL",
        direction: "INTERNAL",
        occurredAt: new Date(),
        summary: vjn.aiSummary ?? text.slice(0, 200),
        details: text,
      },
    });

    return entry.id;
  }

  /**
   * Share VJN to Messaging.
   * Creates a voice message in the specified thread or new DM.
   */
  private async shareToMessage(
    vjn: any,
    actor: AuthenticatedUser,
    dto: ShareVjnDto,
    text: string,
  ): Promise<string> {
    let threadId = dto.threadId;

    // If no thread but recipientUserId, find or create a DM thread
    if (!threadId && dto.recipientUserId) {
      const existing = await this.prisma.messageThread.findFirst({
        where: {
          companyId: actor.companyId,
          type: "DIRECT",
          participants: {
            every: {
              userId: { in: [actor.userId, dto.recipientUserId] },
            },
          },
        },
        include: { participants: true },
      });

      if (existing && existing.participants.length === 2) {
        threadId = existing.id;
      } else {
        const thread = await this.prisma.messageThread.create({
          data: {
            companyId: actor.companyId,
            createdById: actor.userId,
            type: "DIRECT",
            participants: {
              createMany: {
                data: [
                  { userId: actor.userId },
                  { userId: dto.recipientUserId },
                ],
              },
            },
          },
        });
        threadId = thread.id;
      }
    }

    if (!threadId) {
      throw new BadRequestException("threadId or recipientUserId is required when sharing to message");
    }

    const message = await this.prisma.message.create({
      data: {
        threadId,
        senderId: actor.userId,
        senderEmail: actor.email,
        body: text,
        voiceRecordingUrl: vjn.voiceRecordingUrl,
        voiceDurationSecs: vjn.voiceDurationSecs,
        aiTranscribed: true,
        vjnId: vjn.id,
      },
    });

    // Update thread timestamp
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return message.id;
  }
}
