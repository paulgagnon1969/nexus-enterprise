import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { FastifyRequest, FastifyReply } from "fastify";
import { UpdatesService, UpdateManifest } from "./updates.service";
import { JwtAuthGuard, GlobalRoles, GlobalRole, GlobalRolesGuard, Public } from "../auth/auth.guards";

/**
 * Tauri updater endpoint.
 *
 * GET /updates/check/:target/:arch/:currentVersion
 *   → 204 if no update, 200 with JSON if update available
 *
 * POST /updates/publish (admin-only)
 *   → Publish a new update manifest to MinIO
 */
@Controller("updates")
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  /**
   * Tauri updater calls this URL.
   * tauri.conf.json endpoint template:
   *   https://staging-api.nfsgrp.com/updates/check/{{target}}/{{arch}}/{{current_version}}
   */
  @Public()
  @Get("check/:target/:arch/:currentVersion")
  async checkForUpdate(
    @Param("target") target: string,
    @Param("arch") arch: string,
    @Param("currentVersion") currentVersion: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    // Derive the public base URL from the incoming request so download
    // URLs point back through this API (not direct MinIO).
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const host = (req.headers["x-forwarded-host"] as string) || req.hostname;
    const publicBaseUrl = `${proto}://${host}`;

    const update = await this.updatesService.checkForUpdate(
      target,
      arch,
      currentVersion,
      publicBaseUrl,
    );

    if (!update) {
      // 204 = no update available (Tauri convention)
      return reply.status(204).send();
    }

    return reply.status(200).send(update);
  }

  /**
   * Stream an update bundle from MinIO to the client.
   * This proxies the download so clients don't need direct MinIO access.
   */
  @Public()
  @Get("download/:key")
  async downloadUpdate(
    @Param("key") key: string,
    @Res() reply: FastifyReply,
  ) {
    const decodedKey = decodeURIComponent(key);
    try {
      const stream = await this.updatesService.getUpdateFileStream(decodedKey);
      return reply
        .status(200)
        .header("content-type", "application/gzip")
        .header(
          "content-disposition",
          `attachment; filename="${decodedKey.split("/").pop()}"`,
        )
        .send(stream);
    } catch {
      throw new NotFoundException("Update bundle not found");
    }
  }

  /**
   * Publish a new update manifest. Called by the build-and-publish script.
   * Requires SUPER_ADMIN role.
   */
  @Post("publish")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  async publishManifest(@Body() manifest: UpdateManifest) {
    await this.updatesService.publishManifest(manifest);
    return { ok: true, version: manifest.version };
  }
}
