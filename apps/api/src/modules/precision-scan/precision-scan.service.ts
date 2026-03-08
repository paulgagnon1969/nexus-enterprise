import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MeshJobService } from '../compute-mesh/mesh-job.service';
import type { MeshJob } from '../compute-mesh/mesh-node.interface';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class PrecisionScanService {
  private readonly logger = new Logger(PrecisionScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meshJobs: MeshJobService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create scan + dispatch mesh job
  // ---------------------------------------------------------------------------

  async create(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      projectId?: string;
      name?: string;
      detailLevel?: string;
      imageUrls: string[];
    },
  ) {
    if (!payload.imageUrls?.length) {
      throw new BadRequestException('At least one image URL is required');
    }

    // Verify project if provided
    if (payload.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: payload.projectId, companyId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    // Create scan record
    const scan = await this.prisma.precisionScan.create({
      data: {
        companyId,
        projectId: payload.projectId ?? null,
        createdById: actor.userId,
        name: payload.name ?? null,
        detailLevel: payload.detailLevel ?? 'full',
        imageCount: payload.imageUrls.length,
        status: 'PENDING',
        images: {
          create: payload.imageUrls.map((url, i) => ({
            url,
            fileName: url.split('/').pop() || `image-${i}`,
            sizeBytes: 0,
            mimeType: 'image/heic',
            sortOrder: i,
          })),
        },
      },
      include: { images: true },
    });

    // Dispatch mesh job to NexBridge Connect
    const job = await this.meshJobs.createJob({
      type: 'precision_photogrammetry',
      companyId,
      requestedBy: actor.userId,
      preferClient: true,
      preferUserId: actor.userId,
      payload: {
        scanId: scan.id,
        imageUrls: payload.imageUrls,
        detailLevel: payload.detailLevel ?? 'full',
        name: payload.name,
      },
      serverFallback: async (_job: MeshJob) => {
        // No server-side photogrammetry — mark as failed
        await this.prisma.precisionScan.update({
          where: { id: scan.id },
          data: {
            status: 'FAILED',
            error: 'No NexBridge Connect node available for photogrammetry',
          },
        });
        return { error: 'No client node available' };
      },
    });

    // Update scan with mesh job ID
    const updated = await this.prisma.precisionScan.update({
      where: { id: scan.id },
      data: { meshJobId: job.id },
      include: { images: true },
    });

    this.logger.log(
      `PrecisionScan ${scan.id}: created with ${payload.imageUrls.length} images, meshJob=${job.id}`,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Update status (called by NexBridge Connect via mesh job result)
  // ---------------------------------------------------------------------------

  async updateFromResult(
    scanId: string,
    result: {
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
    const scan = await this.prisma.precisionScan.findUnique({
      where: { id: scanId },
    });
    if (!scan) throw new NotFoundException('Precision scan not found');

    return this.prisma.precisionScan.update({
      where: { id: scanId },
      data: {
        status: result.status,
        usdzUrl: result.usdzUrl ?? null,
        objUrl: result.objUrl ?? null,
        daeUrl: result.daeUrl ?? null,
        stlUrl: result.stlUrl ?? null,
        gltfUrl: result.gltfUrl ?? null,
        glbUrl: result.glbUrl ?? null,
        stepUrl: result.stepUrl ?? null,
        skpUrl: result.skpUrl ?? null,
        analysis: result.analysis ? JSON.parse(JSON.stringify(result.analysis)) : undefined,
        processingMs: result.processingMs ?? null,
        error: result.error ?? null,
        completedAt: result.status === 'COMPLETED' ? new Date() : null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Update scan status (progress tracking from NexBridge during processing)
  // ---------------------------------------------------------------------------

  async updateStatus(
    scanId: string,
    status: 'DOWNLOADING' | 'RECONSTRUCTING' | 'CONVERTING' | 'ANALYZING' | 'UPLOADING',
  ) {
    const scan = await this.prisma.precisionScan.findUnique({
      where: { id: scanId },
    });
    if (!scan) throw new NotFoundException('Precision scan not found');

    return this.prisma.precisionScan.update({
      where: { id: scanId },
      data: { status },
    });
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getById(scanId: string, companyId: string) {
    const scan = await this.prisma.precisionScan.findFirst({
      where: { id: scanId, companyId },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!scan) throw new NotFoundException('Precision scan not found');
    return scan;
  }

  async listForCompany(companyId: string, opts?: { projectId?: string }) {
    return this.prisma.precisionScan.findMany({
      where: {
        companyId,
        ...(opts?.projectId ? { projectId: opts.projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { images: true } },
      },
    });
  }
}
