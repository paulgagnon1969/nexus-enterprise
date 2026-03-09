import {
  Body,
  Controller,
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
import { PrecisionScanService } from './precision-scan.service';

@Controller('precision-scans')
export class PrecisionScanController {
  constructor(private readonly scans: PrecisionScanService) {}

  /**
   * POST /precision-scans
   * Create a new precision scan job and dispatch to NexBridge Connect.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  async create(
    @Req() req: any,
    @Body()
    body: {
      projectId?: string;
      name?: string;
      detailLevel?: string;
      imageUrls: string[];
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scans.create(user.companyId, user, body);
  }

  /**
   * GET /precision-scans
   * List precision scans for the current company, optionally filtered by project.
   */
  @UseGuards(CombinedAuthGuard)
  @Get()
  async list(
    @Req() req: any,
    @Query('projectId') projectId?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scans.listForCompany(user.companyId, { projectId });
  }

  /**
   * GET /precision-scans/:scanId
   * Get a single precision scan with images and analysis.
   */
  @UseGuards(CombinedAuthGuard)
  @Get(':scanId')
  async getOne(
    @Req() req: any,
    @Param('scanId') scanId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scans.getById(scanId, user.companyId);
  }

  /**
   * POST /precision-scans/:scanId/retrigger
   * Re-dispatch mesh job for an existing scan (e.g. after a failure).
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(':scanId/retrigger')
  async retrigger(
    @Req() req: any,
    @Param('scanId') scanId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scans.retrigger(scanId, user.companyId, user);
  }

  /**
   * PATCH /precision-scans/:scanId/status
   * Update scan processing status (called by NexBridge mesh job progress).
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch(':scanId/status')
  async updateStatus(
    @Param('scanId') scanId: string,
    @Body() body: { status: string },
  ) {
    return this.scans.updateStatus(
      scanId,
      body.status as 'DOWNLOADING' | 'RECONSTRUCTING' | 'CONVERTING' | 'ANALYZING' | 'UPLOADING',
    );
  }

  /**
   * PATCH /precision-scans/:scanId/result
   * Receive final processing result from NexBridge Connect mesh job.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch(':scanId/result')
  async updateResult(
    @Param('scanId') scanId: string,
    @Body()
    body: {
      status: 'COMPLETED' | 'FAILED';
      usdzUrl?: string;
      objUrl?: string;
      daeUrl?: string;
      stlUrl?: string;
      gltfUrl?: string;
      glbUrl?: string;
      stepUrl?: string;
      skpUrl?: string;
      analysis?: Record<string, unknown>;
      processingMs?: number;
      error?: string;
    },
  ) {
    return this.scans.updateFromResult(scanId, body);
  }
}
