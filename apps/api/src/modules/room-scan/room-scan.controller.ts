import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CombinedAuthGuard, Roles, Role } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { readMultipleFilesFromMultipart } from '../../infra/uploads/multipart';
import { RoomScanService } from './room-scan.service';

@Controller('projects/:projectId/room-scans')
export class RoomScanController {
  constructor(private readonly roomScans: RoomScanService) {}

  /**
   * AI Vision mode: upload 1-4 room photos for GPT-4o analysis.
   * POST /projects/:projectId/room-scans/vision
   * Multipart form: field "photos" (1-4 image files), optional string fields.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('vision')
  async createFromVision(
    @Req() req: FastifyRequest,
    @Param('projectId') projectId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;

    const { files, fields } = await readMultipleFilesFromMultipart(req, {
      fieldName: 'photos',
      captureFields: ['particleId', 'label', 'notes'],
    });

    if (files.length > 4) {
      throw new BadRequestException('Maximum 4 photos allowed');
    }

    // Convert Fastify file parts to buffers for the service
    const photos = await Promise.all(
      files.map(async (f) => ({
        buffer: await f.toBuffer(),
        originalname: f.filename,
        mimetype: f.mimetype,
      })),
    );

    return this.roomScans.createFromPhotos(user.companyId, user, {
      projectId,
      particleId: fields.particleId,
      label: fields.label,
      notes: fields.notes,
      photos,
    });
  }

  /**
   * LiDAR mode: submit pre-structured RoomPlan data from the native module.
   * POST /projects/:projectId/room-scans/lidar
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('lidar')
  async createFromLidar(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      particleId?: string;
      label?: string;
      notes?: string;
      lidarRoomData: Record<string, any>;
      photoUrls?: string[];
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.roomScans.createFromLidar(user.companyId, user, {
      projectId,
      ...body,
    });
  }

  /** List all room scans for a project. */
  @UseGuards(CombinedAuthGuard)
  @Get()
  async list(
    @Req() req: any,
    @Param('projectId') projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.roomScans.listForProject(projectId, user.companyId);
  }

  /** Get a single room scan by ID. */
  @UseGuards(CombinedAuthGuard)
  @Get(':scanId')
  async getOne(
    @Req() req: any,
    @Param('scanId') scanId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.roomScans.getById(scanId, user.companyId);
  }
}
