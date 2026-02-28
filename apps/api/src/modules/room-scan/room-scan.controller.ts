import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CombinedAuthGuard, Roles, Role } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RoomScanService } from './room-scan.service';

@Controller('projects/:projectId/room-scans')
export class RoomScanController {
  constructor(private readonly roomScans: RoomScanService) {}

  /**
   * AI Vision mode: upload 1-4 room photos for GPT-4o analysis.
   * POST /projects/:projectId/room-scans/vision
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('vision')
  @UseInterceptors(FilesInterceptor('photos', 4, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async createFromVision(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @UploadedFiles() photos: Express.Multer.File[],
    @Body() body: { particleId?: string; label?: string; notes?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.roomScans.createFromPhotos(user.companyId, user, {
      projectId,
      particleId: body.particleId,
      label: body.label,
      notes: body.notes,
      photos: photos || [],
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
