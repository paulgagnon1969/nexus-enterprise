import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Public } from '../auth/auth.guards';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';

/**
 * GET /files/:bucket/*
 *
 * Public file proxy — streams objects from MinIO through the API so that
 * stored file URLs are reachable via the Cloudflare tunnel.
 *
 * MinIO runs on an internal Docker network and is NOT tunneled directly.
 * Set MINIO_PUBLIC_URL=https://staging-api.nfsgrp.com/files so that
 * getPublicUrlFromUri() generates URLs that route through this proxy.
 *
 * Responses include aggressive cache headers (1 year, immutable) because
 * storage keys are content-addressed / never reused.
 */
@Controller('files')
@Public()
export class FileProxyController {
  private readonly logger = new Logger(FileProxyController.name);

  constructor(private readonly storage: ObjectStorageService) {}

  @Get(':bucket/*')
  async serveFile(
    @Param('bucket') bucket: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const key = (req.params as any)['*'];

    if (!key || !bucket) {
      throw new NotFoundException('File not found');
    }

    try {
      const stream = await this.storage.getObjectStream({ bucket, key });

      const ext = key.split('.').pop()?.toLowerCase() || '';
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('Access-Control-Allow-Origin', '*');

      return reply.send(stream);
    } catch (err: any) {
      if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') {
        throw new NotFoundException('File not found');
      }
      this.logger.error(`File proxy error: ${bucket}/${key} — ${err?.message}`);
      throw new NotFoundException('File not found');
    }
  }
}

/** Common MIME types for files stored in MinIO. */
const MIME_MAP: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  // Documents
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  // 3D models
  usdz: 'model/vnd.usdz+zip',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  // Video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  // Archives
  zip: 'application/zip',
};
