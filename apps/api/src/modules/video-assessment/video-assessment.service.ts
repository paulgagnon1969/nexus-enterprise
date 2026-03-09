import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { AuditService } from '../../common/audit.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { GeminiService } from './gemini.service';
import type { AssessmentType } from './prompts';

// Valid Prisma enum values — AI output is sanitized against these.
const VALID_ZONES = new Set([
  'ROOF','SIDING','WINDOWS','GUTTERS','FASCIA_SOFFIT','FOUNDATION',
  'DECK_PATIO','FENCING','LANDSCAPING','INTERIOR_WALLS','INTERIOR_CEILING',
  'INTERIOR_FLOOR','INTERIOR_CABINETS','INTERIOR_FIXTURES','PLUMBING',
  'ELECTRICAL','HVAC','OTHER',
]);
const VALID_CATEGORIES = new Set([
  'MISSING_SHINGLES','CURLING','GRANULE_LOSS','HAIL_IMPACT','WIND_LIFT',
  'ALGAE_MOSS','FLASHING','RIDGE_CAP','VALLEY','UNDERLAYMENT','DRAINAGE',
  'CRACKING','PEELING','ROT','WATER_STAIN','MOLD','WARPING','BROKEN_SEAL',
  'MISSING_CAULK','STRUCTURAL_SHIFT','CORROSION','INSECT_DAMAGE',
  'EFFLORESCENCE','SPALLING','OTHER',
]);
const VALID_SEVERITIES = new Set(['LOW','MODERATE','SEVERE','CRITICAL']);
const VALID_CAUSATIONS = new Set([
  'HAIL','WIND','AGE','WATER','FIRE','IMPACT','THERMAL',
  'IMPROPER_INSTALL','SETTLING','PEST','UNKNOWN',
]);

function safeEnum<T extends string>(value: string | undefined, valid: Set<string>, fallback: T): T {
  const v = (value || '').toUpperCase().trim();
  return (valid.has(v) ? v : fallback) as T;
}

/** Coerce AI output to a float, returning null for non-numeric values. */
function safeFloat(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class VideoAssessmentService {
  private readonly logger = new Logger(VideoAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: ObjectStorageService,
    private readonly gemini: GeminiService,
    private readonly audit: AuditService,
  ) {}

  // ── Analyze (Gemini proxy) ──────────────────────────────────────────

  /**
   * Accept frames from the sync client, proxy to Gemini, return structured findings.
   * This does NOT persist anything — the sync client calls POST / after reviewing.
   */
  async analyzeFrames(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      frames: Array<{ base64?: string; gcsUri?: string; mimeType: string }>;
      assessmentType: AssessmentType;
      weatherContext?: string;
      captureDate?: string;
    },
  ) {
    if (!payload.frames?.length) {
      throw new BadRequestException('At least one frame is required');
    }
    if (payload.frames.length > 120) {
      throw new BadRequestException('Maximum 120 frames per analysis');
    }

    this.logger.log(
      `Analyze: company=${companyId}, user=${actor.userId}, ` +
      `frames=${payload.frames.length}, type=${payload.assessmentType}`,
    );

    const result = await this.gemini.analyzeFrames({ ...payload, companyId });

    await this.audit.log(actor, 'VIDEO_ASSESSMENT_ANALYZED', {
      companyId,
      metadata: {
        frameCount: payload.frames.length,
        assessmentType: payload.assessmentType,
        findingCount: result.assessment.findings?.length ?? 0,
        confidence: result.assessment.summary?.confidence,
      },
    });

    return result;
  }

  // ── CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a completed assessment (called by sync client after analysis).
   */
  async create(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      projectId?: string;
      sourceType: 'DRONE' | 'HANDHELD' | 'OTHER';
      videoFileName?: string;
      videoDurationSecs?: number;
      videoResolution?: string;
      frameCount?: number;
      thumbnailUrls?: string[];
      assessmentJson: any;
      rawAiResponse?: string;
      confidenceScore?: number;
      weatherContext?: string;
      captureDate?: string;
      notes?: string;
      findings: Array<{
        zone: string;
        category: string;
        severity: string;
        causation?: string;
        description?: string;
        frameTimestamp?: number;
        thumbnailUrl?: string;
        boundingBoxJson?: any;
        costbookItemCode?: string;
        estimatedQuantity?: number;
        estimatedUnit?: string;
        confidenceScore?: number;
        sortOrder?: number;
      }>;
    },
  ) {
    // Verify project access if projectId provided
    if (payload.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: payload.projectId, companyId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    const assessment = await this.prisma.videoAssessment.create({
      data: {
        companyId,
        projectId: payload.projectId || null,
        sourceType: payload.sourceType,
        status: 'COMPLETE',
        videoFileName: payload.videoFileName,
        videoDurationSecs: payload.videoDurationSecs,
        videoResolution: payload.videoResolution,
        frameCount: payload.frameCount,
        thumbnailUrls: payload.thumbnailUrls ?? [],
        assessmentJson: payload.assessmentJson,
        rawAiResponse: payload.rawAiResponse,
        confidenceScore: payload.confidenceScore,
        weatherContext: payload.weatherContext,
        captureDate: payload.captureDate ? new Date(payload.captureDate) : null,
        notes: payload.notes,
        createdById: actor.userId,
        // If directly assigned to a project, record assignment
        assignedById: payload.projectId ? actor.userId : null,
        assignedAt: payload.projectId ? new Date() : null,
        findings: {
          create: payload.findings.map((f, i) => ({
            companyId,
            zone: safeEnum(f.zone, VALID_ZONES, 'OTHER'),
            category: safeEnum(f.category, VALID_CATEGORIES, 'OTHER'),
            severity: safeEnum(f.severity, VALID_SEVERITIES, 'MODERATE'),
            causation: safeEnum(f.causation, VALID_CAUSATIONS, 'UNKNOWN'),
            description: f.description,
            frameTimestamp: f.frameTimestamp,
            thumbnailUrl: f.thumbnailUrl,
            boundingBoxJson: f.boundingBoxJson,
            costbookItemCode: f.costbookItemCode ?? null,
            estimatedQuantity: safeFloat(f.estimatedQuantity),
            estimatedUnit: f.estimatedUnit ?? null,
            confidenceScore: safeFloat(f.confidenceScore),
            sortOrder: f.sortOrder ?? i,
          })),
        },
      },
      include: { findings: true },
    });

    // If assigned to a project, create a ProjectFile cross-link
    if (payload.projectId) {
      await this.createProjectFileLink(companyId, payload.projectId, assessment.id);
    }

    await this.audit.log(actor, 'VIDEO_ASSESSMENT_CREATED', {
      companyId,
      projectId: payload.projectId,
      metadata: {
        assessmentId: assessment.id,
        sourceType: payload.sourceType,
        findingCount: payload.findings.length,
        confidence: payload.confidenceScore,
      },
    });

    return assessment;
  }

  /**
   * Store NexCAD photogrammetry-backed measurements on a finding.
   * Does NOT replace AI estimates — stores both for comparison.
   */
  async enhanceFinding(
    assessmentId: string,
    findingId: string,
    companyId: string,
    data: {
      measuredQuantity: number | null;
      measuredUnit: string | null;
      measurementMethod: string;
      meshAnalysisJson?: any;
      measuredConfidence?: number;
      measurementMs?: number;
    },
  ) {
    const finding = await this.prisma.videoAssessmentFinding.findFirst({
      where: { id: findingId, assessmentId, companyId },
    });
    if (!finding) throw new NotFoundException('Finding not found');

    return this.prisma.videoAssessmentFinding.update({
      where: { id: findingId },
      data: {
        measuredQuantity: data.measuredQuantity,
        measuredUnit: data.measuredUnit,
        measurementMethod: data.measurementMethod,
        meshAnalysisJson: data.meshAnalysisJson ?? undefined,
        measuredConfidence: data.measuredConfidence,
        measurementMs: data.measurementMs,
      },
    });
  }

  /**
   * List assessments for a company, with filters.
   */
  async list(
    companyId: string,
    filters?: {
      projectId?: string;
      status?: string;
      unassigned?: boolean;
      sourceType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { companyId };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.status) where.status = filters.status;
    if (filters?.unassigned) where.projectId = null;
    if (filters?.sourceType) where.sourceType = filters.sourceType;

    const [items, total] = await Promise.all([
      this.prisma.videoAssessment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        include: {
          findings: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              zone: true,
              category: true,
              severity: true,
              causation: true,
              description: true,
              frameTimestamp: true,
              thumbnailUrl: true,
              confidenceScore: true,
              sortOrder: true,
            },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedBy: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      this.prisma.videoAssessment.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Get a single assessment by ID with all findings.
   */
  async getById(assessmentId: string, companyId: string) {
    const assessment = await this.prisma.videoAssessment.findFirst({
      where: { id: assessmentId, companyId },
      include: {
        findings: {
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!assessment) throw new NotFoundException('Video assessment not found');
    return assessment;
  }

  /**
   * Update an assessment — assign to project, edit notes, change status.
   */
  async update(
    assessmentId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      projectId?: string;
      status?: 'COMPLETE' | 'REVIEWED';
      notes?: string;
      assessmentJson?: any;
    },
  ) {
    const existing = await this.prisma.videoAssessment.findFirst({
      where: { id: assessmentId, companyId },
    });
    if (!existing) throw new NotFoundException('Video assessment not found');

    const data: any = {};

    // Handle project assignment
    if (payload.projectId !== undefined) {
      if (payload.projectId) {
        const project = await this.prisma.project.findFirst({
          where: { id: payload.projectId, companyId },
        });
        if (!project) throw new NotFoundException('Project not found');
      }

      data.projectId = payload.projectId || null;
      data.assignedById = payload.projectId ? actor.userId : null;
      data.assignedAt = payload.projectId ? new Date() : null;

      // Create or clean up ProjectFile cross-link
      if (payload.projectId && !existing.projectId) {
        await this.createProjectFileLink(companyId, payload.projectId, assessmentId);
      }
    }

    if (payload.status) data.status = payload.status;
    if (payload.notes !== undefined) data.notes = payload.notes;
    if (payload.assessmentJson !== undefined) data.assessmentJson = payload.assessmentJson;

    const updated = await this.prisma.videoAssessment.update({
      where: { id: assessmentId },
      data,
      include: { findings: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.log(actor, 'VIDEO_ASSESSMENT_UPDATED', {
      companyId,
      projectId: updated.projectId || undefined,
      metadata: {
        assessmentId,
        changes: Object.keys(data),
      },
    });

    return updated;
  }

  /**
   * Soft-delete an assessment.
   */
  async remove(assessmentId: string, companyId: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.videoAssessment.findFirst({
      where: { id: assessmentId, companyId },
    });
    if (!existing) throw new NotFoundException('Video assessment not found');

    // Delete findings first (cascade should handle this, but be explicit)
    await this.prisma.videoAssessmentFinding.deleteMany({
      where: { assessmentId },
    });

    await this.prisma.videoAssessment.delete({
      where: { id: assessmentId },
    });

    await this.audit.log(actor, 'VIDEO_ASSESSMENT_DELETED', {
      companyId,
      metadata: { assessmentId },
    });

    return { success: true };
  }

  // ── Finding override ────────────────────────────────────────────────

  /**
   * Human override of an AI-generated finding.
   */
  async overrideFinding(
    assessmentId: string,
    findingId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      zone?: string;
      category?: string;
      severity?: string;
      causation?: string;
      description?: string;
      costbookItemCode?: string;
      estimatedQuantity?: number;
      estimatedUnit?: string;
    },
  ) {
    const finding = await this.prisma.videoAssessmentFinding.findFirst({
      where: { id: findingId, assessmentId, companyId },
    });
    if (!finding) throw new NotFoundException('Finding not found');

    const data: any = {
      overriddenByUserId: actor.userId,
      overriddenAt: new Date(),
    };

    if (payload.zone) data.zone = payload.zone;
    if (payload.category) data.category = payload.category;
    if (payload.severity) data.severity = payload.severity;
    if (payload.causation) data.causation = payload.causation;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.costbookItemCode !== undefined) data.costbookItemCode = payload.costbookItemCode;
    if (payload.estimatedQuantity !== undefined) data.estimatedQuantity = payload.estimatedQuantity;
    if (payload.estimatedUnit !== undefined) data.estimatedUnit = payload.estimatedUnit;

    const updated = await this.prisma.videoAssessmentFinding.update({
      where: { id: findingId },
      data,
    });

    await this.audit.log(actor, 'VIDEO_FINDING_OVERRIDDEN', {
      companyId,
      metadata: {
        assessmentId,
        findingId,
        changes: Object.keys(payload),
      },
    });

    return updated;
  }

  // ── Zoom & Teach ────────────────────────────────────────────────

  /**
   * Process a "Zoom & Teach" submission: user selected a frame area and
   * provided a hint. Re-analyze with Google Search grounding.
   */
  async teach(
    assessmentId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      frameIndex: number;
      cropBox?: { x: number; y: number; w: number; h: number };
      imageUri: string;
      userHint: string;
      assessmentType?: string;
    },
  ) {
    const assessment = await this.prisma.videoAssessment.findFirst({
      where: { id: assessmentId, companyId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const assessmentType = (payload.assessmentType || 'TARGETED') as any;

    this.logger.log(
      `Teach: assessment=${assessmentId}, frame=${payload.frameIndex}, ` +
      `hint="${payload.userHint.substring(0, 80)}"`,
    );

    // Call Gemini with Google Search grounding
    const result = await this.gemini.teachAnalysis({
      companyId,
      imageUri: payload.imageUri,
      userHint: payload.userHint,
      assessmentType,
    });

    // Persist teaching example
    const example = await this.prisma.assessmentTeachingExample.create({
      data: {
        companyId,
        assessmentId,
        frameIndex: payload.frameIndex,
        cropBox: payload.cropBox ?? undefined,
        croppedImageUri: payload.imageUri,
        userHint: payload.userHint,
        assessmentType,
        aiRefinedFinding: result.finding || undefined,
        aiRawResponse: result.rawResponse,
        webSourcesUsed: result.webSources,
        createdById: actor.userId,
      },
    });

    // If we got a structured finding, also add it to the assessment
    let newFinding = null;
    if (result.finding) {
      const maxSort = await this.prisma.videoAssessmentFinding.aggregate({
        where: { assessmentId },
        _max: { sortOrder: true },
      });

      newFinding = await this.prisma.videoAssessmentFinding.create({
        data: {
          companyId,
          assessmentId,
          zone: safeEnum(result.finding.zone, VALID_ZONES, 'OTHER'),
          category: safeEnum(result.finding.category, VALID_CATEGORIES, 'OTHER'),
          severity: safeEnum(result.finding.severity, VALID_SEVERITIES, 'MODERATE'),
          causation: safeEnum(result.finding.causation, VALID_CAUSATIONS, 'UNKNOWN'),
          description: result.finding.description,
          frameTimestamp: null,
          confidenceScore: result.finding.confidence,
          sortOrder: (maxSort._max.sortOrder || 0) + 1,
        },
      });
    }

    await this.audit.log(actor, 'VIDEO_ASSESSMENT_TEACH', {
      companyId,
      metadata: {
        assessmentId,
        teachId: example.id,
        frameIndex: payload.frameIndex,
        userHint: payload.userHint,
        hasFinding: !!result.finding,
        webSourceCount: result.webSources.length,
      },
    });

    return {
      teachingExample: example,
      finding: newFinding,
      narrative: result.narrative,
      webSources: result.webSources,
    };
  }

  /**
   * Confirm or correct a teaching example. Confirmed examples are
   * injected into future assessments as few-shot context.
   */
  async confirmTeach(
    teachId: string,
    companyId: string,
    payload: { confirmed: boolean; correctionJson?: any },
  ) {
    const example = await this.prisma.assessmentTeachingExample.findFirst({
      where: { id: teachId, companyId },
    });
    if (!example) throw new NotFoundException('Teaching example not found');

    return this.prisma.assessmentTeachingExample.update({
      where: { id: teachId },
      data: {
        confirmed: payload.confirmed,
        confirmedAt: new Date(),
        userCorrectionJson: payload.correctionJson || undefined,
      },
    });
  }

  // ── Presigned upload URL ────────────────────────────────────────

  /**
   * Generate a presigned GCS upload URL for thumbnail frames.
   */
  async getPresignedUploadUrl(
    companyId: string,
    opts: { fileName: string; contentType: string },
  ) {
    const key = `video-assessments/${companyId}/${Date.now()}-${opts.fileName}`;

    return this.gcs.createSignedUploadUrl({
      key,
      contentType: opts.contentType,
    });
  }

  /**
   * Upload a frame directly from base64 — bypasses presigned URLs.
   * Used by NexBRIDGE desktop clients that can't reach MinIO directly.
   */
  async uploadFrameDirect(
    companyId: string,
    opts: { fileName: string; contentType: string; base64: string },
  ) {
    const key = `video-assessments/${companyId}/${Date.now()}-${opts.fileName}`;
    const buffer = Buffer.from(opts.base64, "base64");

    const fileUri = await this.gcs.uploadBuffer({
      key,
      buffer,
      contentType: opts.contentType,
    });

    return { fileUri };
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Create a ProjectFile entry in a "Video Assessments" folder when an
   * assessment is assigned to a project. This makes the assessment
   * discoverable from the project's normal file tree.
   */
  private async createProjectFileLink(
    companyId: string,
    projectId: string,
    assessmentId: string,
  ) {
    try {
      // Find or create the "Video Assessments" folder
      let folder = await this.prisma.projectFileFolder.findFirst({
        where: {
          companyId,
          projectId,
          name: 'Video Assessments',
          parentId: null,
        },
      });

      if (!folder) {
        folder = await this.prisma.projectFileFolder.create({
          data: {
            companyId,
            projectId,
            name: 'Video Assessments',
            parentId: null,
          },
        });
      }

      // Create a ProjectFile pointing to the assessment viewer URL
      await this.prisma.projectFile.create({
        data: {
          companyId,
          projectId,
          folderId: folder.id,
          storageUrl: `nexlevel://assessment/${assessmentId}`,
          fileName: `Assessment-${assessmentId.substring(0, 8)}.nexlevel`,
          mimeType: 'application/x-nexlevel-assessment',
        },
      });
    } catch (err: any) {
      // Non-fatal — don't fail the assessment creation if file link fails
      this.logger.warn(`Failed to create ProjectFile link: ${err?.message}`);
    }
  }
}
