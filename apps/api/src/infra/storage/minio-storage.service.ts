import { Injectable, Logger } from "@nestjs/common";
import * as Minio from "minio";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { ObjectStorageService } from "./object-storage.service";

/**
 * MinIO-backed ObjectStorageService for self-hosted / shadow deployments.
 *
 * Env vars:
 *   MINIO_ENDPOINT   — e.g. "minio" (Docker service name) or "localhost"
 *   MINIO_PORT       — e.g. "9000" (default)
 *   MINIO_USE_SSL    — "true" or "false" (default false)
 *   MINIO_ACCESS_KEY — root user / access key
 *   MINIO_SECRET_KEY — root password / secret key
 *   MINIO_BUCKET     — default bucket name (fallback for resolveBucket)
 *   MINIO_PUBLIC_URL — public base URL for presigned/public links
 *                      e.g. "https://storage-staging.ncc.nfsgrp.com"
 */
@Injectable()
export class MinioStorageService extends ObjectStorageService {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly client: Minio.Client;

  constructor() {
    super();
    const endpoint = process.env.MINIO_ENDPOINT || "localhost";
    const port = Number(process.env.MINIO_PORT || "9000");
    const useSSL = process.env.MINIO_USE_SSL === "true";

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    });
  }

  async createSignedUploadUrl(options: {
    bucket?: string;
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; fileUri: string }> {
    const { key, expiresInSeconds = 15 * 60 } = options;
    const bucketName = this.resolveBucket(options.bucket);

    await this.ensureBucket(bucketName);

    const uploadUrl = await this.client.presignedPutObject(
      bucketName,
      key,
      expiresInSeconds,
    );

    const fileUri = `gs://${bucketName}/${key}`;

    this.logger.log("[minio] createSignedUploadUrl", {
      bucket: bucketName,
      key,
      contentType: options.contentType,
      expiresInSeconds,
      fileUri,
    });

    return { uploadUrl, fileUri };
  }

  async uploadBuffer(options: {
    bucket?: string;
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<string> {
    const { key, buffer, contentType } = options;
    const bucketName = this.resolveBucket(options.bucket);

    await this.ensureBucket(bucketName);

    this.logger.log("[minio] uploadBuffer:start", {
      bucket: bucketName,
      key,
      contentType,
    });

    await this.client.putObject(bucketName, key, buffer, buffer.length, {
      "Content-Type": contentType,
    });

    const fileUri = `gs://${bucketName}/${key}`;

    this.logger.log("[minio] uploadBuffer:done", {
      bucket: bucketName,
      key,
      contentType,
      fileUri,
    });

    return fileUri;
  }

  getPublicUrlFromUri(uri: string): string {
    const { bucket, object } = this.parseUri(uri);
    const base =
      process.env.MINIO_PUBLIC_URL ||
      `http://${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || "9000"}`;
    return `${base}/${bucket}/${object}`;
  }

  async createSignedReadUrl(options: {
    bucket?: string;
    key: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const { key, expiresInSeconds = 15 * 60 } = options;
    const bucketName = this.resolveBucket(options.bucket);

    return this.client.presignedGetObject(
      bucketName,
      key,
      expiresInSeconds,
    );
  }

  async deleteFile(options: { bucket?: string; key: string }): Promise<void> {
    const { key } = options;
    const bucketName =
      options.bucket ||
      process.env.XACT_UPLOADS_BUCKET ||
      process.env.GCS_UPLOADS_BUCKET ||
      process.env.MINIO_BUCKET;
    if (!bucketName) return;

    try {
      await this.client.removeObject(bucketName, key);
      this.logger.log("[minio] deleteFile:done", { bucket: bucketName, key });
    } catch (err: any) {
      this.logger.warn("[minio] deleteFile:error", {
        bucket: bucketName,
        key,
        message: err?.message ?? String(err),
      });
    }
  }

  async downloadToTmp(uri: string): Promise<string> {
    const { bucket, object } = this.parseUri(uri);
    const tmpBase = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
    const uploadDir = path.join(tmpBase, "ncc_uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = path.basename(object).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const localPath = path.join(uploadDir, `${Date.now()}-${safeName}`);

    this.logger.log("[minio] downloadToTmp:start", {
      uri,
      bucket,
      object,
      localPath,
    });

    const stream = await this.client.getObject(bucket, object);
    await pipeline(stream, createWriteStream(localPath));

    this.logger.log("[minio] downloadToTmp:done", {
      uri,
      bucket,
      object,
      localPath,
    });

    return localPath;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async ensureBucket(name: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(name);
      if (!exists) {
        await this.client.makeBucket(name);
        this.logger.log(`[minio] Created bucket: ${name}`);
      }
    } catch {
      // Best-effort — bucket may already exist or permissions may prevent check
    }
  }
}
