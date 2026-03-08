import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CombinedAuthGuard, Roles, Role } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequiresModule } from '../billing/module.guard';
import { VideoAssessmentService } from './video-assessment.service';
import type { AssessmentType } from './prompts';

@RequiresModule('NEXBRIDGE_ASSESS')
@Controller('video-assessment')
export class VideoAssessmentController {
  constructor(private readonly service: VideoAssessmentService) {}

  /**
   * POST /video-assessment/analyze
   * Proxy frames to Gemini for AI analysis. Returns structured findings
   * without persisting. The sync client reviews and then calls POST /.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('analyze')
  async analyze(@Req() req: any, @Body() body: {
    frames: Array<{ base64?: string; gcsUri?: string; mimeType: string }>;
    assessmentType: AssessmentType;
    weatherContext?: string;
    captureDate?: string;
  }) {
    const user = req.user as AuthenticatedUser;
    return this.service.analyzeFrames(user.companyId, user, body);
  }

  /**
   * POST /video-assessment/presigned-upload
   * Get a presigned GCS URL for uploading thumbnail frames.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('presigned-upload')
  async presignedUpload(@Req() req: any, @Body() body: {
    fileName: string;
    contentType: string;
  }) {
    const user = req.user as AuthenticatedUser;
    return this.service.getPresignedUploadUrl(user.companyId, body);
  }

  /**
   * POST /video-assessment/upload-frame
   * Upload a frame directly (base64) — avoids presigned URL issues
   * when the client can't reach MinIO directly.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('upload-frame')
  async uploadFrame(@Req() req: any, @Body() body: {
    fileName: string;
    contentType: string;
    base64: string;
  }) {
    const user = req.user as AuthenticatedUser;
    return this.service.uploadFrameDirect(user.companyId, body);
  }

  /**
   * POST /video-assessment/:id/teach
   * Zoom & Teach: user crops a frame area, provides a hint, and the AI
   * re-analyzes with Google Search grounding for reference materials.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(':id/teach')
  async teach(@Req() req: any, @Param('id') id: string, @Body() body: {
    frameIndex: number;
    cropBox?: { x: number; y: number; w: number; h: number };
    imageUri: string; // GCS URI of the (optionally cropped) frame
    userHint: string;
    assessmentType?: string;
  }) {
    const user = req.user as AuthenticatedUser;
    return this.service.teach(id, user.companyId, user, body);
  }

  /**
   * PATCH /video-assessment/:assessmentId/teach/:teachId/confirm
   * Confirm or correct a teaching example.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch(':assessmentId/teach/:teachId/confirm')
  async confirmTeach(
    @Req() req: any,
    @Param('assessmentId') assessmentId: string,
    @Param('teachId') teachId: string,
    @Body() body: { confirmed: boolean; correctionJson?: any },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.service.confirmTeach(teachId, user.companyId, body);
  }

  /**
   * POST /video-assessment
   * Create a completed assessment with findings (called by sync client).
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const user = req.user as AuthenticatedUser;
    return this.service.create(user.companyId, user, body);
  }

  /**
   * GET /video-assessment
   * List assessments with optional filters.
   */
  @UseGuards(CombinedAuthGuard)
  @Get()
  async list(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('unassigned') unassigned?: string,
    @Query('sourceType') sourceType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.service.list(user.companyId, {
      projectId,
      status,
      unassigned: unassigned === 'true',
      sourceType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * GET /video-assessment/:id
   * Get a single assessment with all findings.
   */
  @UseGuards(CombinedAuthGuard)
  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const user = req.user as AuthenticatedUser;
    return this.service.getById(id, user.companyId);
  }

  /**
   * PATCH /video-assessment/:id
   * Update assessment (assign to project, change status, edit notes).
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      projectId?: string;
      status?: 'COMPLETE' | 'REVIEWED';
      notes?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.service.update(id, user.companyId, user, body);
  }

  /**
   * DELETE /video-assessment/:id
   * Delete an assessment and its findings.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const user = req.user as AuthenticatedUser;
    return this.service.remove(id, user.companyId, user);
  }

  /**
   * POST /video-assessment/:id/findings/:findingId/enhance
   * Store photogrammetry-backed measurements from NexCAD enhanced assessment.
   * Called by NexBRIDGE after running the burst → photogrammetry → mesh pipeline.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(':id/findings/:findingId/enhance')
  async enhanceFinding(
    @Req() req: any,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() body: {
      measuredQuantity: number | null;
      measuredUnit: string | null;
      measurementMethod: string;
      meshAnalysisJson?: any;
      measuredConfidence?: number;
      measurementMs?: number;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.service.enhanceFinding(id, findingId, user.companyId, body);
  }

  /**
   * POST /video-assessment/:id/findings/:findingId/override
   * Human override of an AI-generated finding.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(':id/findings/:findingId/override')
  async overrideFinding(
    @Req() req: any,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() body: {
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
    const user = req.user as AuthenticatedUser;
    return this.service.overrideFinding(id, findingId, user.companyId, user, body);
  }
}
