import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { FastifyReply } from "fastify";
import { UpdatesService, UpdateManifest } from "./updates.service";
import { JwtAuthGuard, GlobalRoles, GlobalRole, GlobalRolesGuard } from "../auth/auth.guards";

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
  @Get("check/:target/:arch/:currentVersion")
  async checkForUpdate(
    @Param("target") target: string,
    @Param("arch") arch: string,
    @Param("currentVersion") currentVersion: string,
    @Res() reply: FastifyReply,
  ) {
    const update = await this.updatesService.checkForUpdate(
      target,
      arch,
      currentVersion,
    );

    if (!update) {
      // 204 = no update available (Tauri convention)
      return reply.status(204).send();
    }

    return reply.status(200).send(update);
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
