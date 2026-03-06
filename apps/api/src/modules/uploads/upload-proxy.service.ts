import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ObjectStorageService } from "../../infra/storage/object-storage.service";

/**
 * Manages short-lived upload proxy tokens.
 *
 * Problem: MinIO presigned URLs point to the Docker-internal hostname `minio`
 * which the browser cannot reach when MinIO is behind Docker/Cloudflare Tunnel.
 *
 * Solution: Instead of returning a presigned MinIO URL, we return an API URL
 * (e.g. /uploads/put/<token>). The browser PUTs to the API, which stores the
 * file in MinIO server-side. The token authorises the upload (no JWT needed).
 */
@Injectable()
export class UploadProxyService {
  private readonly logger = new Logger(UploadProxyService.name);

  private readonly tokens = new Map<
    string,
    { key: string; bucket: string; contentType: string; expiresAt: number }
  >();

  // Cleanup expired tokens every 60 seconds
  private readonly cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [token, data] of this.tokens) {
      if (now > data.expiresAt) this.tokens.delete(token);
    }
  }, 60_000);

  constructor(private readonly storage: ObjectStorageService) {}

  /**
   * Create a proxy upload token. Returns the token string and the canonical
   * fileUri that will be written once the browser uploads.
   */
  createToken(opts: {
    key: string;
    bucket: string;
    contentType: string;
    ttlMs?: number;
  }): { token: string; fileUri: string } {
    const token = randomUUID();
    const ttl = opts.ttlMs ?? 15 * 60_000; // 15 min default

    this.tokens.set(token, {
      key: opts.key,
      bucket: opts.bucket,
      contentType: opts.contentType,
      expiresAt: Date.now() + ttl,
    });

    // Build the canonical fileUri (same format MinIO would produce)
    const fileUri = `gs://${opts.bucket}/${opts.key}`;

    return { token, fileUri };
  }

  /**
   * Consume a token and upload the provided buffer to object storage.
   * Returns the fileUri on success, or null if the token is invalid/expired.
   */
  async consumeAndUpload(
    token: string,
    body: Buffer,
  ): Promise<string | null> {
    const data = this.tokens.get(token);
    if (!data || Date.now() > data.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    this.tokens.delete(token);

    const fileUri = await this.storage.uploadBuffer({
      key: data.key,
      bucket: data.bucket,
      buffer: body,
      contentType: data.contentType,
    });

    this.logger.log(
      `Proxy upload: ${data.key} (${data.contentType}, ${Math.round(body.length / 1024)} KB) → ${fileUri}`,
    );

    return fileUri;
  }
}
