import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MeshJobService } from '../compute-mesh/mesh-job.service';
import { PushService } from '../notifications/push.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import type { MeshJob } from '../compute-mesh/mesh-node.interface';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { GlobalRole } from '../auth/auth.guards';

// Sweep interval: check for stuck PENDING scans every 30 seconds
const SWEEP_INTERVAL_MS = 30_000;
// Grace period before a PENDING scan is re-dispatched (allow the initial offer to resolve)
const REOFFER_AFTER_MS = 45_000; // 45 seconds
// Alert the user on their device if the scan is still stuck after this long
const NOTIFY_AFTER_MS = 5 * 60_000; // 5 minutes
// Give up and mark FAILED after this long with no NexBridge pickup
const FAIL_AFTER_MS = 15 * 60_000; // 15 minutes

@Injectable()
export class PrecisionScanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrecisionScanService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /** Track which scans we've already sent a "still waiting" push for (avoid spam) */
  private notifiedScanIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly meshJobs: MeshJobService,
    private readonly push: PushService,
    private readonly storage: ObjectStorageService,
  ) {}

  onModuleInit() {
    // Register for node-registration events so we sweep immediately when NexBridge connects
    this.meshJobs.setOnNodeRegistered((companyId, nodeId) => {
      this.logger.log(
        `Node ${nodeId} registered for company ${companyId} — sweeping pending scans`,
      );
      this.sweepPendingScans().catch((err) =>
        this.logger.error(`Sweep after node register failed: ${err?.message}`),
      );
    });

    // Listen for mesh job completions — bridge result to PrecisionScan record
    this.meshJobs.setOnJobCompleted((job) => {
      if (job.type !== 'precision_photogrammetry') return;
      const scanId = (job.payload as any)?.scanId;
      if (!scanId) return;

      this.logger.log(
        `PrecisionScan ${scanId}: mesh job ${job.id} completed by client — bridging result`,
      );

    // URLs are already populated by the /upload endpoint during the pipeline.
      // The bridge handler just needs to finalize status + processing time.
      const r = (job.result ?? {}) as Record<string, any>;
      this.updateFromResult(scanId, {
        status: 'COMPLETED',
        // Preserve any URLs already written by the upload endpoint
        analysis: r.analysis ?? undefined,
        processingMs: job.processingMs ?? undefined,
      }).catch((err) =>
        this.logger.error(
          `PrecisionScan ${scanId}: bridge update failed: ${err?.message}`,
        ),
      );
    });

    // Periodic sweep as safety net
    this.sweepTimer = setInterval(() => {
      this.sweepPendingScans().catch((err) =>
        this.logger.error(`Periodic sweep failed: ${err?.message}`),
      );
    }, SWEEP_INTERVAL_MS);

    this.logger.log('Precision scan sweep scheduler started');
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pending scan sweep — the core fix for stuck scans
  // ---------------------------------------------------------------------------

  async sweepPendingScans(): Promise<void> {
    const now = Date.now();

    // Find all in-flight scans (PENDING or actively processing)
    const pendingScans = await this.prisma.precisionScan.findMany({
      where: {
        status: {
          in: ['PENDING', 'DOWNLOADING', 'RECONSTRUCTING', 'CONVERTING', 'ANALYZING', 'UPLOADING'],
        },
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (pendingScans.length === 0) return;

    for (const scan of pendingScans) {
      // Use updatedAt so retriggers reset the timeout clock
      const ageMs = now - scan.updatedAt.getTime();

      // --- FAIL: scan has been in-flight for > 15 minutes ---
      if (ageMs > FAIL_AFTER_MS) {
        // Don't fail if the mesh job is still actively being processed
        if (scan.meshJobId) {
          const job = await this.meshJobs.getJob(scan.meshJobId);
          if (
            job &&
            (job.status === 'accepted' || job.status === 'processing')
          ) {
            // NexBridge is working on it — don't interfere
            this.logger.debug(
              `PrecisionScan ${scan.id}: ${Math.round(ageMs / 60_000)}min old but mesh job is ${job.status} — skipping FAIL`,
            );
            continue;
          }
        }

        this.logger.warn(
          `PrecisionScan ${scan.id}: stuck ${scan.status} for ${Math.round(ageMs / 60_000)}min — marking FAILED`,
        );

        await this.prisma.precisionScan.update({
          where: { id: scan.id },
          data: {
            status: 'FAILED',
            error: 'No NexBridge Connect node was available to process this scan. Please ensure NexBridge is running and try again.',
          },
        });

        // Push notification: scan failed
        await this.push.sendToUsers([scan.createdById], {
          title: 'Precision Scan Failed',
          body: scan.name
            ? `"${scan.name}" could not be processed — NexBridge was unavailable.`
            : 'Your precision scan could not be processed — NexBridge was unavailable.',
          data: { type: 'precision_scan', scanId: scan.id, status: 'FAILED' },
          categoryId: 'precision_scan',
        });

        this.notifiedScanIds.delete(scan.id);
        continue;
      }

      // --- NOTIFY: scan stuck for > 5 minutes, alert user once ---
      if (ageMs > NOTIFY_AFTER_MS && !this.notifiedScanIds.has(scan.id)) {
        this.notifiedScanIds.add(scan.id);

        await this.push.sendToUsers([scan.createdById], {
          title: 'Scan Waiting for NexBridge',
          body: scan.name
            ? `"${scan.name}" has been waiting ${Math.round(ageMs / 60_000)} minutes. Check that NexBridge Connect is running.`
            : `Your precision scan has been waiting ${Math.round(ageMs / 60_000)} minutes. Check that NexBridge Connect is running.`,
          data: { type: 'precision_scan', scanId: scan.id, status: 'PENDING' },
          categoryId: 'precision_scan',
        });

        this.logger.warn(
          `PrecisionScan ${scan.id}: stuck ${Math.round(ageMs / 60_000)}min — notified user ${scan.createdById}`,
        );
      }

      // --- REOFFER: scan has been PENDING > 45s, re-dispatch ---
      if (ageMs > REOFFER_AFTER_MS) {
        // Check if there's already an active mesh job (don't double-dispatch)
        if (scan.meshJobId) {
          const existingJob = await this.meshJobs.getJob(scan.meshJobId);
          if (
            existingJob &&
            (existingJob.status === 'offered' ||
              existingJob.status === 'accepted' ||
              existingJob.status === 'processing')
          ) {
            // Job is actively being handled — skip
            continue;
          }
        }

        this.logger.log(
          `PrecisionScan ${scan.id}: re-dispatching after ${Math.round(ageMs / 1000)}s`,
        );

        const imageUrls = scan.images.map((img) => img.url);

        try {
          const job = await this.meshJobs.createJob({
            type: 'precision_photogrammetry',
            companyId: scan.companyId,
            requestedBy: scan.createdById,
            preferClient: true,
            preferUserId: scan.createdById,
            payload: {
              scanId: scan.id,
              imageUrls,
              detailLevel: scan.detailLevel ?? 'full',
              name: scan.name,
            },
            serverFallback: async (_job: MeshJob) => {
              this.logger.debug(
                `PrecisionScan ${scan.id}: re-offer fallback — no node, will retry on next sweep`,
              );
              return { queued: true, message: 'Waiting for NexBridge Connect node' };
            },
          });

          await this.prisma.precisionScan.update({
            where: { id: scan.id },
            data: { meshJobId: job.id },
          });
        } catch (err: any) {
          this.logger.error(
            `PrecisionScan ${scan.id}: re-dispatch failed: ${err?.message}`,
          );
        }
      }
    }
  }

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
        // No NexBridge node available right now — keep scan PENDING
        // so it can be picked up when a node comes online.
        this.logger.warn(
          `PrecisionScan ${scan.id}: no NexBridge node available, staying PENDING`,
        );
        return { queued: true, message: 'Waiting for NexBridge Connect node' };
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

  // ---------------------------------------------------------------------------
  // Upload scan result files to MinIO and save URLs to the DB record
  // ---------------------------------------------------------------------------

  async uploadScanFiles(
    scanId: string,
    files: Array<{ fieldName: string; fileName: string; buffer: Buffer }>,
  ) {
    const scan = await this.prisma.precisionScan.findUnique({
      where: { id: scanId },
    });
    if (!scan) throw new NotFoundException('Precision scan not found');

    const urlMap: Record<string, string> = {};

    for (const file of files) {
      // Determine format from the field name (file_usdz, file_obj, etc.)
      const fmt = file.fieldName.replace(/^file_/, '');
      const ext = file.fileName.split('.').pop() || fmt;
      const key = `precision-scans/${scanId}/model.${ext}`;

      const contentType = this.mimeTypeForFormat(ext);

      const uri = await this.storage.uploadBuffer({
        key,
        buffer: file.buffer,
        contentType,
      });

      const publicUrl = this.storage.getPublicUrlFromUri(uri);
      const urlField = `${fmt}Url`;
      urlMap[urlField] = publicUrl;

      this.logger.debug(
        `PrecisionScan ${scanId}: uploaded model.${ext} (${(file.buffer.length / 1048576).toFixed(1)}MB) → ${urlField}`,
      );
    }

    // Update the DB record with whatever URLs we got
    const data: Record<string, any> = {};
    const urlFields = ['usdzUrl', 'objUrl', 'daeUrl', 'stlUrl', 'gltfUrl', 'glbUrl', 'stepUrl', 'skpUrl'];
    for (const field of urlFields) {
      if (urlMap[field]) {
        data[field] = urlMap[field];
      }
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.precisionScan.update({
        where: { id: scanId },
        data,
      });
    }

    this.logger.log(
      `PrecisionScan ${scanId}: uploaded ${files.length} files — ${Object.keys(urlMap).join(', ')}`,
    );

    return { scanId, urls: urlMap, uploadedFiles: files.map((f) => f.fileName) };
  }

  private mimeTypeForFormat(ext: string): string {
    const map: Record<string, string> = {
      usdz: 'model/vnd.usdz+zip',
      obj: 'model/obj',
      dae: 'model/vnd.collada+xml',
      stl: 'model/stl',
      gltf: 'model/gltf+json',
      glb: 'model/gltf-binary',
      step: 'model/step',
      stp: 'model/step',
      skp: 'application/vnd.sketchup.skp',
      json: 'application/json',
    };
    return map[ext] || 'application/octet-stream';
  }

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

    // Only overwrite URL fields if explicitly provided (upload endpoint may have
    // already written them — don't null them out)
    const data: Record<string, any> = {
      status: result.status,
      analysis: result.analysis ? JSON.parse(JSON.stringify(result.analysis)) : undefined,
      processingMs: result.processingMs ?? null,
      error: result.error ?? null,
      completedAt: result.status === 'COMPLETED' ? new Date() : null,
    };
    const urlFields = ['usdzUrl', 'objUrl', 'daeUrl', 'stlUrl', 'gltfUrl', 'glbUrl', 'stepUrl', 'skpUrl'] as const;
    for (const field of urlFields) {
      if (result[field] !== undefined) {
        data[field] = result[field];
      }
    }

    const updated = await this.prisma.precisionScan.update({
      where: { id: scanId },
      data,
    });

    // Clean up notification tracking
    this.notifiedScanIds.delete(scanId);

    // Push notification to the scan creator
    if (result.status === 'COMPLETED') {
      const secs = result.processingMs ? `${(result.processingMs / 1000).toFixed(0)}s` : '';
      await this.push.sendToUsers([scan.createdById], {
        title: 'Precision Scan Complete',
        body: scan.name
          ? `"${scan.name}" is ready${secs ? ` (${secs})` : ''} — tap to view results.`
          : `Your precision scan is ready${secs ? ` (${secs})` : ''} — tap to view results.`,
        data: { type: 'precision_scan', scanId, status: 'COMPLETED' },
        categoryId: 'precision_scan',
      });
    } else if (result.status === 'FAILED') {
      await this.push.sendToUsers([scan.createdById], {
        title: 'Precision Scan Failed',
        body: scan.name
          ? `"${scan.name}" failed: ${result.error || 'Unknown error'}`
          : `Your precision scan failed: ${result.error || 'Unknown error'}`,
        data: { type: 'precision_scan', scanId, status: 'FAILED' },
        categoryId: 'precision_scan',
      });
    }

    return updated;
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
  // Retrigger a scan (re-dispatch mesh job)
  // ---------------------------------------------------------------------------

  async retrigger(scanId: string, companyId: string, actor: AuthenticatedUser) {
    const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;
    const scan = await this.prisma.precisionScan.findFirst({
      where: { id: scanId, ...(isSuperAdmin ? {} : { companyId }) },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!scan) throw new NotFoundException('Precision scan not found');

    if (scan.status === 'COMPLETED') {
      throw new BadRequestException('Scan already completed');
    }

    // Reset status
    await this.prisma.precisionScan.update({
      where: { id: scanId },
      data: { status: 'PENDING', error: null, meshJobId: null },
    });

    const imageUrls = scan.images.map((img) => img.url);

    // Dispatch new mesh job (use scan's own companyId for node matching)
    const job = await this.meshJobs.createJob({
      type: 'precision_photogrammetry',
      companyId: scan.companyId,
      requestedBy: scan.createdById,
      preferClient: true,
      preferUserId: scan.createdById,
      searchAllCompanies: isSuperAdmin,
      payload: {
        scanId: scan.id,
        imageUrls,
        detailLevel: scan.detailLevel ?? 'full',
        name: scan.name,
      },
      serverFallback: async (_job: MeshJob) => {
        this.logger.warn(
          `PrecisionScan ${scan.id}: no NexBridge node available, staying PENDING`,
        );
        return { queued: true, message: 'Waiting for NexBridge Connect node' };
      },
    });

    const updated = await this.prisma.precisionScan.update({
      where: { id: scanId },
      data: { meshJobId: job.id },
      include: { images: true },
    });

    this.logger.log(
      `PrecisionScan ${scan.id}: retriggered, new meshJob=${job.id}`,
    );

    return updated;
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
