import { Injectable } from "@nestjs/common";
import { Storage } from "@google-cloud/storage";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

@Injectable()
export class GcsService {
  private readonly storage: Storage;

  constructor() {
    this.storage = new Storage();
  }

  private parseGsUri(uri: string): { bucket: string; object: string } {
    const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid GCS URI: ${uri}`);
    }
    return { bucket: match[1]!, object: match[2]! };
  }

  async createSignedUploadUrl(options: {
    bucket?: string;
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; fileUri: string }> {
    const { key, contentType, expiresInSeconds = 15 * 60 } = options;
    const bucketName =
      options.bucket || process.env.XACT_UPLOADS_BUCKET || process.env.GCS_UPLOADS_BUCKET;

    if (!bucketName) {
      throw new Error("XACT_UPLOADS_BUCKET (or GCS_UPLOADS_BUCKET) is not configured");
    }

    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);

      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + expiresInSeconds * 1000,
        contentType,
      });

      const fileUri = `gs://${bucketName}/${key}`;
      // Lightweight structured log for observability
      console.log("[gcs] createSignedUploadUrl", {
        bucket: bucketName,
        key,
        contentType,
        expiresInSeconds,
        fileUri,
        projectId:
          process.env.GCLOUD_PROJECT ||
          process.env.GCP_PROJECT ||
          process.env.PROJECT_ID ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          null,
      });

      return {
        uploadUrl: url,
        fileUri,
      };
    } catch (err: any) {
      console.error("[gcs] createSignedUploadUrl error", {
        bucket: bucketName,
        key,
        contentType,
        code: err?.code,
        message: err?.message ?? String(err),
      });
      throw err;
    }
  }

  /**
   * Compute a public HTTP URL for a given gs:// URI. This assumes the
   * underlying bucket/object is readable via this base; callers are
   * responsible for configuring bucket ACLs appropriately.
   */
  getPublicUrlFromUri(uri: string): string {
    const { bucket, object } = this.parseGsUri(uri);
    const base = process.env.GCS_PUBLIC_BASE_URL || "https://storage.googleapis.com";
    return `${base}/${bucket}/${object}`;
  }

  /**
   * Download a gs:// URI to a temporary file and return the local path.
   */
  async downloadToTmp(uri: string): Promise<string> {
    const { bucket, object } = this.parseGsUri(uri);
    const tmpBase = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
    const uploadDir = path.join(tmpBase, "ncc_uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = path.basename(object).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const localPath = path.join(
      uploadDir,
      `${Date.now()}-${safeName}`,
    );

    console.log("[gcs] downloadToTmp:start", { uri, bucket, object, localPath });

    const gcsBucket = this.storage.bucket(bucket);
    const file = gcsBucket.file(object);
    await file.download({ destination: localPath });

    console.log("[gcs] downloadToTmp:done", { uri, bucket, object, localPath });

    return localPath;
  }
}
