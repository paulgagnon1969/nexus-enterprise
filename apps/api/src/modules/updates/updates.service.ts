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
    publicBaseUrl: string,
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

    // Rewrite the download URL to go through the API proxy instead of
    // direct MinIO (which is not publicly reachable).
    const minioKey = this.extractMinioKey(platform.url);
    const proxyUrl = minioKey
      ? `${publicBaseUrl}/updates/download/${encodeURIComponent(minioKey)}`
      : platform.url;

    return {
      version: manifest.version,
      notes: manifest.notes,
      pub_date: manifest.pub_date,
      url: proxyUrl,
      signature: platform.signature,
    };
  }

  /**
   * Stream a file from the updates bucket. Used by the download proxy.
   */
  async getUpdateFileStream(key: string): Promise<NodeJS.ReadableStream> {
    return this.storage.getObjectStream({
      bucket: UPDATES_BUCKET,
      key,
    });
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

  /**
   * Extract the MinIO object key from a full MinIO URL.
   * e.g. "http://localhost:9000/nexbridge-updates/v1.1.0/foo.tar.gz"
   *   -> "v1.1.0/foo.tar.gz"
   */
  private extractMinioKey(url: string): string | null {
    try {
      const u = new URL(url);
      // Path format: /nexbridge-updates/v1.1.0/filename.tar.gz
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === UPDATES_BUCKET) {
        return parts.slice(1).join("/");
      }
      return null;
    } catch {
      return null;
    }
  }

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
