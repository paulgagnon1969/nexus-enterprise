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
  Logger,
} from '@nestjs/common';
import { readMultipleFilesFromMultipart } from '../../infra/uploads/multipart';
import { CombinedAuthGuard, Roles, Role } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrecisionScanService } from './precision-scan.service';

@Controller('precision-scans')
export class PrecisionScanController {
  private readonly logger = new Logger(PrecisionScanController.name);

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
   * POST /precision-scans/:scanId/upload
   * Receive multipart file uploads from NexBridge Connect, store in MinIO,
   * and update the scan record with public URLs.
   *
   * NexBRIDGE sends files as multipart parts named `file_usdz`, `file_obj`,
   * `file_dae`, etc. plus optional `analysis` (JSON) and `jobId` (text).
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(':scanId/upload')
  async uploadFiles(
    @Req() req: any,
    @Param('scanId') scanId: string,
  ) {
    const { files, fields } = await readMultipleFilesFromMultipart(req, {
      captureFields: ['jobId'],
    });

    this.logger.log(
      `Upload for scan ${scanId}: ${files.length} files (meshJob=${fields.jobId ?? 'unknown'})`,
    );

    const filePayloads = await Promise.all(
      files.map(async (f) => ({
        fieldName: (f as any).fieldname || (f as any).field || f.filename.replace(/^model\./, 'file_').replace(/\..+$/, ''),
        fileName: f.filename,
        buffer: await f.toBuffer(),
      })),
    );

    return this.scans.uploadScanFiles(scanId, filePayloads);
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
