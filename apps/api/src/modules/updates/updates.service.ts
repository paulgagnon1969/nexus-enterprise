import { Injectable, Logger } from "@nestjs/common";
import { ObjectStorageService } from "../../infra/storage/object-storage.service";

export interface UpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<
    string,
    { url: string; signature: string }
  >;
}

const UPDATES_BUCKET = "nexbridge-updates";
const MANIFEST_KEY = "latest.json";

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);

  constructor(private readonly storage: ObjectStorageService) {}

  /**
   * Fetch the latest update manifest from MinIO.
   * Returns null if no manifest exists yet.
   */
  async getLatestManifest(): Promise<UpdateManifest | null> {
    try {
      const stream = await this.storage.getObjectStream({
        bucket: UPDATES_BUCKET,
        key: MANIFEST_KEY,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const json = Buffer.concat(chunks).toString("utf-8");
      return JSON.parse(json) as UpdateManifest;
    } catch (err: any) {
      // NoSuchKey or bucket doesn't exist — no updates published yet
      if (
        err?.code === "NoSuchKey" ||
        err?.code === "NoSuchBucket" ||
        err?.message?.includes("does not exist")
      ) {
        this.logger.debug("[updates] No manifest found — no updates published yet");
        return null;
      }
      this.logger.error("[updates] Failed to fetch manifest", err?.message);
      return null;
    }
  }

  /**
   * Check if a newer version is available for the given target/arch.
   * Returns the platform-specific update payload, or null if no update.
   */
  async checkForUpdate(
    target: string,
    arch: string,
    currentVersion: string,
  ): Promise<{
    version: string;
    notes: string;
    pub_date: string;
    url: string;
    signature: string;
  } | null> {
    const manifest = await this.getLatestManifest();
    if (!manifest) return null;

    // Compare versions (semver-like: split by dots, compare numerically)
    if (!this.isNewer(manifest.version, currentVersion)) {
      return null;
    }

    // Find the matching platform key (e.g. "darwin-aarch64", "darwin-x86_64")
    const platformKey = `${target}-${arch}`;
    const platform =
      manifest.platforms[platformKey] ||
      // Fallback: try "darwin-universal" for universal builds
      manifest.platforms[`${target}-universal`];

    if (!platform) {
      this.logger.debug(
        `[updates] No platform match for ${platformKey} in manifest`,
      );
      return null;
    }

    return {
      version: manifest.version,
      notes: manifest.notes,
      pub_date: manifest.pub_date,
      url: platform.url,
      signature: platform.signature,
    };
  }

  /**
   * Upload a new manifest to MinIO. Called by the build script via API.
   */
  async publishManifest(manifest: UpdateManifest): Promise<void> {
    const json = JSON.stringify(manifest, null, 2);
    await this.storage.uploadBuffer({
      bucket: UPDATES_BUCKET,
      key: MANIFEST_KEY,
      buffer: Buffer.from(json, "utf-8"),
      contentType: "application/json",
    });
    this.logger.log(`[updates] Published manifest v${manifest.version}`);
  }

  // ── Private ───────────────────────────────────────────────────────

  private isNewer(latest: string, current: string): boolean {
    const l = latest.split(".").map(Number);
    const c = current.split(".").map(Number);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
      const lv = l[i] ?? 0;
      const cv = c[i] ?? 0;
      if (lv > cv) return true;
      if (lv < cv) return false;
    }
    return false;
  }
}
