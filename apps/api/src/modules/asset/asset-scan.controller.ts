import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequiresModule } from '../billing/module.guard';
import { readMultipleFilesFromMultipart, readSingleFileFromMultipart } from '../../infra/uploads/multipart';
import { AssetScanService } from './asset-scan.service';

@RequiresModule('ASSETS')
@UseGuards(JwtAuthGuard)
@Controller('assets/scan')
export class AssetScanController {
  constructor(private readonly scanService: AssetScanService) {}

  /**
   * AI Tag Reader: upload 1-4 photos of equipment nameplate → GPT-4o extracts identity.
   * POST /assets/scan/tag-read
   * Multipart: field "photos" (1-4 image files)
   */
  @Post('tag-read')
  async tagRead(@Req() req: FastifyRequest) {
    const user = (req as any).user as AuthenticatedUser;

    const { files } = await readMultipleFilesFromMultipart(req, {
      fieldName: 'photos',
    });

    if (files.length > 4) {
      throw new BadRequestException('Maximum 4 photos allowed');
    }

    const photos = await Promise.all(
      files.map(async (f) => ({
        buffer: await f.toBuffer(),
        originalname: f.filename,
        mimetype: f.mimetype,
      })),
    );

    return this.scanService.tagRead(user.companyId, user, photos);
  }

  /**
   * Quick serial-only read for fleet onboarding rapid-fire mode.
   * POST /assets/scan/serial-read
   * Multipart: field "photo" (1 image file)
   */
  @Post('serial-read')
  async serialRead(@Req() req: FastifyRequest) {
    const user = (req as any).user as AuthenticatedUser;

    const { file } = await readSingleFileFromMultipart(req, {
      fieldName: 'photo',
    });

    const photo = {
      buffer: await file.toBuffer(),
      originalname: file.filename,
      mimetype: file.mimetype,
    };

    return this.scanService.serialRead(user.companyId, user, photo);
  }

  /**
   * Store Object Capture results (USDZ model + dimensions from on-device scan).
   * POST /assets/scan/object-capture
   * Multipart: field "model" (USDZ file, optional), "thumbnail" (image, optional),
   *   + JSON fields "dimensions", "boundingBox"
   */
  @Post('object-capture')
  async objectCapture(@Req() req: FastifyRequest) {
    const user = (req as any).user as AuthenticatedUser;

    const { files, fields } = await readMultipleFilesFromMultipart(req, {
      captureFields: ['dimensions', 'boundingBox'],
    });

    // Separate model and thumbnail files
    let modelBuffer: Buffer | undefined;
    let thumbnailBuffer: Buffer | undefined;

    for (const f of files) {
      if (f.filename?.endsWith('.usdz') || f.mimetype === 'model/vnd.usdz+zip') {
        modelBuffer = await f.toBuffer();
      } else {
        thumbnailBuffer = await f.toBuffer();
      }
    }

    if (!fields.dimensions) {
      throw new BadRequestException('dimensions field is required');
    }

    const dimensions = JSON.parse(fields.dimensions);
    const boundingBox = fields.boundingBox ? JSON.parse(fields.boundingBox) : undefined;

    return this.scanService.storeObjectCapture(user.companyId, user, {
      modelBuffer,
      thumbnailBuffer,
      dimensions,
      boundingBox,
    });
  }

  /**
   * Fleet onboard: create N assets from a template with individual serial numbers.
   * POST /assets/scan/fleet-onboard
   */
  @Post('fleet-onboard')
  async fleetOnboard(
    @Req() req: any,
    @Body() body: {
      templateAssetId: string;
      serialNumbers: string[];
      locationId?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scanService.fleetOnboard(user.companyId, user, body);
  }

  /**
   * Create an Asset from a completed scan (tag read or object capture).
   * POST /assets/scan/create-from-scan
   */
  @Post('create-from-scan')
  async createFromScan(
    @Req() req: any,
    @Body() body: {
      scanId: string;
      name: string;
      assetType?: string;
      isTemplate?: boolean;
      manufacturer?: string;
      model?: string;
      serialNumberOrVin?: string;
      year?: number;
      dimensions?: { length: number; width: number; height: number; unit: string };
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scanService.createAssetFromScan(user.companyId, user, body);
  }

  /**
   * Upload original hi-res tag photos after user verifies AI extraction.
   * POST /assets/scan/:id/originals
   * Multipart: field "photos" (1-4 image files)
   */
  @Post(':id/originals')
  async uploadOriginals(
    @Req() req: FastifyRequest,
    @Param('id') scanId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;

    const { files } = await readMultipleFilesFromMultipart(req, {
      fieldName: 'photos',
    });

    if (files.length > 4) {
      throw new BadRequestException('Maximum 4 photos allowed');
    }

    const photos = await Promise.all(
      files.map(async (f) => ({
        buffer: await f.toBuffer(),
        originalname: f.filename,
        mimetype: f.mimetype,
      })),
    );

    return this.scanService.uploadOriginals(user.companyId, scanId, photos);
  }

  /** List recent scans for the company. */
  @Get()
  async listScans(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.scanService.listScans(user.companyId, limit ? parseInt(limit, 10) : 20);
  }

  /** List template assets (for fleet onboarding selection). */
  @Get('templates')
  async listTemplates(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.scanService.listTemplates(user.companyId);
  }
}
