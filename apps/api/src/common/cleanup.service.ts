import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import fs from "node:fs/promises";
import path from "node:path";
import { ImportJobStatus } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Run once on startup, then on a fixed interval (default: once per day).
    await this.runCleanup().catch((err) => {
      this.logger.error("Initial cleanup run failed", err?.stack ?? String(err));
    });

    const intervalMs = Number(process.env.IMPORT_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000);

    this.timer = setInterval(() => {
      this.runCleanup().catch((err) => {
        this.logger.error("Scheduled cleanup run failed", err?.stack ?? String(err));
      });
    }, intervalMs);
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCleanup() {
    const cutoff = new Date(Date.now() - FIVE_DAYS_MS);

    await this.cleanupTmpUploads(cutoff);
    await this.cleanupImportJobs(cutoff);
  }

  private async cleanupTmpUploads(cutoff: Date) {
    // tmp_uploads are written by the Next.js web app in apps/web/tmp_uploads
    // relative to the monorepo. From the API's cwd (apps/api), this is
    // ../web/tmp_uploads.
    const candidateDirs = [
      path.resolve(process.cwd(), "..", "web", "tmp_uploads"),
      // Fallback in case uploads are ever written at the workspace root.
      path.resolve(process.cwd(), "..", "tmp_uploads"),
    ];

    for (const dir of candidateDirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const fullPath = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(fullPath);
            if (stat.mtime < cutoff) {
              await fs.unlink(fullPath);
              this.logger.debug?.(
                `Deleted tmp upload older than cutoff: ${fullPath}`,
              );
            }
          } catch (err) {
            // Best-effort; log and continue.
            this.logger.warn(
              `Failed to consider tmp upload for deletion: ${fullPath}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          // Directory doesn't exist; that's fine.
          continue;
        }
        this.logger.warn(
          `Error while scanning tmp_uploads directory: ${dir}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  private async cleanupImportJobs(cutoff: Date) {
    try {
      const result = await this.prisma.importJob.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          status: {
            in: [ImportJobStatus.FAILED, ImportJobStatus.SUCCEEDED],
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Deleted ${result.count} importJob rows older than 5 days`);
      }
    } catch (err) {
      this.logger.error(
        "Failed to clean up old importJob records",
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
