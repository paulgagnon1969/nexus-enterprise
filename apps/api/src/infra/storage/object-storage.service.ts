/**
 * ObjectStorageService — abstract base class for object storage providers.
 *
 * Implementation:
 *   - MinioStorageService (MinIO — self-hosted on Mac Studio shadow server)
 *
 * Injected via StorageModule. Consumers should always depend on ObjectStorageService.
 */
export abstract class ObjectStorageService {
  /**
   * Generate a presigned upload URL so the browser can PUT directly to storage.
   */
  abstract createSignedUploadUrl(options: {
    bucket?: string;
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; fileUri: string }>;

  /**
   * Upload a buffer directly from the server and return its storage URI.
   */
  abstract uploadBuffer(options: {
    bucket?: string;
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<string>;

  /**
   * Compute a public-facing HTTP URL for a stored object.
   * Returns the configured MinIO public base URL.
   */
  abstract getPublicUrlFromUri(uri: string): string;

  /**
   * Generate a presigned read URL with time-limited access.
   */
  abstract createSignedReadUrl(options: {
    bucket?: string;
    key: string;
    expiresInSeconds?: number;
  }): Promise<string>;

  /**
   * Return a readable stream for an object in storage.
   * Used by the file proxy to stream files to clients without writing to disk.
   */
  abstract getObjectStream(options: {
    bucket?: string;
    key: string;
  }): Promise<NodeJS.ReadableStream>;

  /**
   * Delete a file from storage. Best-effort — does not throw if the file
   * doesn't exist.
   */
  abstract deleteFile(options: { bucket?: string; key: string }): Promise<void>;

  /**
   * Download a storage URI (gs://… or s3://…) to a temporary file and return
   * the local path.
   */
  abstract downloadToTmp(uri: string): Promise<string>;

  // ── Shared helpers ──────────────────────────────────────────────────

  /**
   * Parse a `gs://bucket/object` style URI into bucket + object components.
   * Both GCS and MinIO implementations use the same URI format in the DB.
   */
  protected parseUri(uri: string): { bucket: string; object: string } {
    const match = uri.match(/^(?:gs|s3):\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid storage URI: ${uri}`);
    }
    return { bucket: match[1]!, object: match[2]! };
  }

  /**
   * Resolve the effective bucket name from explicit option, or env-var fallback.
   */
  protected resolveBucket(explicit?: string): string {
    const bucket =
      explicit ||
      process.env.XACT_UPLOADS_BUCKET ||
      process.env.GCS_UPLOADS_BUCKET ||
      process.env.MINIO_BUCKET;
    if (!bucket) {
      throw new Error(
        "No storage bucket configured (set XACT_UPLOADS_BUCKET, GCS_UPLOADS_BUCKET, or MINIO_BUCKET)",
      );
    }
    return bucket;
  }
}
